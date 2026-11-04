import { countWords } from "../lib/text.js";
import { acceptModelProduct } from "./catalog.js";
import { templateEnrich } from "./template.js";

const SUMMARY_MIN = 80;
const SUMMARY_MAX = 120;

export function buildEnrichmentPrompt(post) {
  const transcript = typeof post.transcript === "string" ? post.transcript.trim() : "";
  const lines = [
    transcript
      ? "A partir del caption y de la transcripción, responde solo JSON con las claves products, summary, faqs y quote."
      : "A partir del caption, responde solo JSON con las claves products, summary, faqs y quote.",
    "products es una lista de objetos {name, brand}.",
    "summary es un resumen factual de 80 a 120 palabras, en español, sin precios.",
    transcript
      ? "faqs son 3 objetos {question, answer} que se responden con el caption o con la transcripción."
      : "faqs son 3 objetos {question, answer} que se responden con el caption.",
    transcript
      ? "quote es una cita textual del caption o de la transcripción, copiada carácter por carácter, sin comillas agregadas."
      : "quote es una cita textual del caption, copiada carácter por carácter, sin comillas agregadas.",
    transcript
      ? "No inventes datos que no estén en el caption o en la transcripción. Si no estás seguro, omite el dato."
      : "No inventes datos que no estén en el caption. Si no estás seguro, omite el dato.",
    "",
    `Creador: ${post.displayName} (@${post.username})`,
    `Caption: ${post.caption}`,
  ];
  if (transcript) lines.push(`Transcripción: ${transcript}`);
  return lines.join("\n");
}

export function quoteIsLiteral(quote, post) {
  if (!quote) return false;
  if (String(post.caption || "").includes(quote)) return true;
  const transcript = typeof post.transcript === "string" ? post.transcript : "";
  return transcript.length > 0 && transcript.includes(quote);
}

export function llmMessageText(payload) {
  return payload?.choices?.[0]?.message?.content
    || payload?.message?.content
    || payload?.output_text
    || payload?.completion_message?.content?.text
    || "";
}

export function parseLlmJson(payload) {
  const text = llmMessageText(payload);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("El modelo no devolvió JSON");
  const data = JSON.parse(text.slice(start, end + 1));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("JSON del modelo incompleto");
  }
  return {
    products: Array.isArray(data.products) ? data.products : [],
    quote: data.quote == null ? "" : String(data.quote).trim(),
    summary: data.summary == null ? "" : String(data.summary).trim(),
    faqs: Array.isArray(data.faqs) ? data.faqs : [],
  };
}

export function summaryInRange(summary) {
  const words = countWords(summary);
  return words >= SUMMARY_MIN && words <= SUMMARY_MAX;
}

function usableFaqs(faqs) {
  if (!Array.isArray(faqs) || faqs.length < 3) return null;
  const three = faqs.slice(0, 3).map((faq) => ({
    question: String(faq?.question || "").trim(),
    answer: String(faq?.answer || "").trim(),
  }));
  if (three.some((faq) => !faq.question || !faq.answer)) return null;
  return three;
}

function stampMetaModels(result, post) {
  const models = [];
  if (result.provider === "meta" && result.textSource === "llm" && result.modelName) {
    models.push({ role: "texto", model: result.modelName });
  }
  if (result.transcriptUsed && post.transcriptModel) {
    models.push({ role: "audio", model: post.transcriptModel });
  }
  result.metaModels = models;
  return result;
}

export function finalizeLlmOutput(data, post, provider, modelName) {
  const template = templateEnrich(post);
  const quoteOk = quoteIsLiteral(data.quote, post);
  const products = [];
  const seen = new Set();
  for (const item of data.products || []) {
    const kept = acceptModelProduct(item, post.caption);
    if (!kept || seen.has(kept.id)) continue;
    seen.add(kept.id);
    products.push(kept);
  }
  const summaryOk = summaryInRange(data.summary);
  const faqs = quoteOk && summaryOk ? usableFaqs(data.faqs) : null;
  return {
    provider,
    modelName,
    textSource: summaryOk ? "llm" : "template",
    products: products.length ? products : template.products,
    quote: quoteOk ? data.quote : template.quote,
    summary: summaryOk ? data.summary : template.summary,
    faqs: faqs || template.faqs,
  };
}

async function postJson(url, body, headers, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`El modelo respondió ${response.status}`);
  return parseLlmJson(await response.json());
}

async function completeMeta(post, cfg, fetchImpl) {
  if (!cfg.metaModelApiKey) throw new Error("falta META_MODEL_API_KEY");
  const model = cfg.metaModelName || "muse-spark-1.3";
  const request = () => postJson(cfg.metaModelApiUrl, {
    model,
    messages: [{ role: "user", content: buildEnrichmentPrompt(post) }],
  }, {
    Authorization: `Bearer ${cfg.metaModelApiKey}`,
    "Content-Type": "application/json",
  }, fetchImpl);
  const first = await request();
  const chosen = summaryInRange(first.summary) ? first : await request();
  const result = finalizeLlmOutput(chosen, post, "meta", model);
  result.transcriptUsed = Boolean(String(post.transcript || "").trim());
  return stampMetaModels(result, post);
}

async function completeOllama(post, cfg, fetchImpl) {
  const base = (cfg.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = cfg.ollamaModel || "llama3.1";
  const request = () => postJson(`${base}/api/chat`, {
    model,
    stream: false,
    messages: [{ role: "user", content: buildEnrichmentPrompt(post) }],
  }, { "Content-Type": "application/json" }, fetchImpl);
  const first = await request();
  const chosen = summaryInRange(first.summary) ? first : await request();
  const result = finalizeLlmOutput(chosen, post, "ollama", model);
  result.transcriptUsed = Boolean(String(post.transcript || "").trim());
  return stampMetaModels(result, post);
}

export async function completeWithLlm(post, cfg, fetchImpl = fetch) {
  if (cfg.llmProvider === "meta") return completeMeta(post, cfg, fetchImpl);
  if (cfg.llmProvider === "ollama") return completeOllama(post, cfg, fetchImpl);
  throw new Error("LLM_PROVIDER no está en meta ni ollama");
}
