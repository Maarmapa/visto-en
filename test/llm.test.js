import assert from "node:assert/strict";
import { test } from "node:test";
import { countWords } from "../lib/text.js";
import { loadConfig } from "../lib/config.js";
import { ingest } from "../ingest/run.js";
import { completeWithLlm, parseLlmJson } from "../enrich/llm.js";
import { extractQuote } from "../enrich/template.js";
import { enrichPost } from "../enrich/run.js";
import { buildPage } from "../site/page.js";
import { renderPost } from "../site/render.js";

function words(count) {
  return Array.from({ length: count }, (_, index) => `palabra${index}`).join(" ");
}

function payload(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(data) } }] }),
  };
}

const QUOTE = "La cobertura del One4All aguanta el sol de la tarde sin tizar.";

function good(overrides = {}) {
  return {
    products: [{ name: "Molotow One4All", brand: "Molotow" }],
    summary: words(90),
    faqs: [
      { question: "¿Una?", answer: "La primera." },
      { question: "¿Dos?", answer: "La segunda." },
      { question: "¿Tres?", answer: "La tercera." },
    ],
    quote: QUOTE,
    ...overrides,
  };
}

async function demoPost() {
  const posts = await ingest(loadConfig({ MOCK: "1", INGEST_MOCK: "1", LLM_PROVIDER: "template" }));
  return posts.find((post) => post.username === "artista_demo_1");
}

function metaCfg(extra = {}) {
  return loadConfig({
    MOCK: "1",
    INGEST_MOCK: "1",
    LLM_PROVIDER: "meta",
    META_MODEL_API_KEY: "token-de-prueba",
    ...extra,
  });
}

test("Meta no se llama sin llave", async () => {
  const post = await demoPost();
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    throw new Error("no debía llamar a fetch");
  };
  const cfg = loadConfig({ MOCK: "1", INGEST_MOCK: "1", LLM_PROVIDER: "meta" });
  await assert.rejects(() => completeWithLlm(post, cfg, fetchImpl), /falta META_MODEL_API_KEY/);
  await assert.rejects(() => enrichPost(post, cfg, fetchImpl), /falta META_MODEL_API_KEY/);
  assert.equal(calls, 0);
});

test("el request a Meta usa el chat completions de muse-spark y no lleva la llave en el cuerpo", async () => {
  const post = await demoPost();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    return payload(good());
  };
  const enriched = await completeWithLlm(post, metaCfg({ META_MODEL_NAME: "muse-spark-1.2" }), fetchImpl);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.meta.ai/v1/chat/completions");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers.Authorization, "Bearer token-de-prueba");
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, "muse-spark-1.2");
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "user");
  assert.match(body.messages[0].content, /Caption:/);
  assert.equal(body.messages[0].content.includes("Transcripción:"), false);
  assert.equal(seen[0].init.body.includes("token-de-prueba"), false);
  assert.equal(enriched.textSource, "llm");
  assert.equal(enriched.modelName, "muse-spark-1.2");
  assert.equal(enriched.quote, QUOTE);
  const html = renderPost(buildPage(post, enriched, metaCfg()), metaCfg());
  assert.match(html, /Texto generado con muse-spark-1\.2 a partir del caption/);
  assert.match(html, /Modelos de Meta en esta ficha: muse-spark-1\.2 \(texto\)\./);
  assert.equal(html.includes("muse-image"), false);
  assert.equal(html.includes("muse-voice"), false);
});

test("MOCK no bloquea al modelo y la ingesta sigue en fixtures", async () => {
  const post = await demoPost();
  const hosts = [];
  const fetchImpl = async (url) => {
    hosts.push(new URL(url).host);
    return payload(good());
  };
  const cfg = metaCfg();
  const enriched = await enrichPost(post, cfg, fetchImpl);
  assert.deepEqual(hosts, ["api.meta.ai"]);
  assert.equal(enriched.textSource, "llm");
  assert.equal(enriched.modelName, "muse-spark-1.3");
  let ingestCalls = 0;
  const posts = await ingest(cfg, () => {
    ingestCalls += 1;
    throw new Error("la ingesta no debía salir");
  });
  assert.equal(ingestCalls, 0);
  assert.ok(posts.some((item) => item.username === "artista_demo_1"));
});

test("una cita que no está en el caption vuelve a la de la plantilla", async () => {
  const post = await demoPost();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return payload(good({ quote: "esta cita no está en el caption" }));
  };
  const enriched = await completeWithLlm(post, metaCfg(), fetchImpl);
  assert.equal(calls, 1);
  assert.equal(enriched.quote, extractQuote(post.caption));
  assert.equal(post.caption.includes(enriched.quote), true);
  assert.equal(enriched.textSource, "llm");
});

test("un producto fuera del catálogo y del caption se descarta", async () => {
  const post = await demoPost();
  const fetchImpl = async () => payload(good({
    products: [
      { name: "Pintura Fantasma", brand: "Nadie" },
      { name: "taller", brand: "Lugar" },
    ],
  }));
  const enriched = await completeWithLlm(post, metaCfg(), fetchImpl);
  assert.equal(enriched.products.some((item) => item.name === "Pintura Fantasma"), false);
  assert.equal(enriched.products.some((item) => item.name === "taller"), true);
  const onlyFake = await completeWithLlm(post, metaCfg(), async () => payload(good({
    products: [{ name: "Pintura Fantasma", brand: "Nadie" }],
  })));
  assert.equal(onlyFake.products.some((item) => item.name === "Pintura Fantasma"), false);
  assert.equal(onlyFake.products.some((item) => item.name === "Molotow One4All"), true);
});

test("un resumen fuera de rango se reintenta una vez y después usa la plantilla", async () => {
  const post = await demoPost();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return payload(good({ summary: calls === 1 ? "corto" : words(100) }));
  };
  const retried = await completeWithLlm(post, metaCfg(), fetchImpl);
  assert.equal(calls, 2);
  assert.equal(countWords(retried.summary), 100);
  assert.equal(retried.textSource, "llm");

  calls = 0;
  const bothShort = await completeWithLlm(post, metaCfg(), async () => {
    calls += 1;
    return payload(good({ summary: "sigue corto" }));
  });
  assert.equal(calls, 2);
  assert.equal(bothShort.textSource, "template");
  assert.ok(countWords(bothShort.summary) >= 80 && countWords(bothShort.summary) <= 120);
  const html = renderPost(buildPage(post, bothShort, metaCfg()), metaCfg());
  assert.match(html, /Plantilla determinista, sin modelo/);
  assert.match(html, /Ningún modelo de Meta tocó esta ficha/);
});

test("Ollama arma el request local y acepta completion_message", async () => {
  const post = await demoPost();
  const cfg = loadConfig({ MOCK: "1", LLM_PROVIDER: "ollama" });
  let seen;
  const enriched = await completeWithLlm(post, cfg, async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: JSON.stringify(good()) } }),
    };
  });
  assert.equal(seen.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(seen.body.model, "llama3.1");
  assert.equal(seen.body.stream, false);
  assert.equal(enriched.provider, "ollama");
  assert.equal(enriched.modelName, "llama3.1");
  const parsed = parseLlmJson({
    completion_message: { content: { text: JSON.stringify(good({ summary: words(88) })) } },
  });
  assert.equal(countWords(parsed.summary), 88);
});

test("la cita puede salir de la transcripción si es literal", async () => {
  const post = await demoPost();
  const transcript = "Primero di una base, porque sin base la pintura se cuartea al doblar la tela.";
  assert.equal(post.caption.includes(transcript), false);
  const spoken = { ...post, transcript, transcriptModel: "muse-voice-transcribe-1.0" };
  let prompt = "";
  const enriched = await completeWithLlm(spoken, metaCfg(), async (_url, init) => {
    prompt = JSON.parse(init.body).messages[0].content;
    return payload(good({ quote: transcript }));
  });
  assert.match(prompt, /Transcripción:/);
  assert.equal(prompt.includes(transcript), true);
  assert.equal(enriched.quote, transcript);
  assert.equal(enriched.transcriptUsed, true);
  assert.deepEqual(enriched.metaModels, [
    { role: "texto", model: "muse-spark-1.3" },
    { role: "audio", model: "muse-voice-transcribe-1.0" },
  ]);
  const html = renderPost(buildPage(post, enriched, metaCfg()), metaCfg());
  assert.match(html, /Texto generado con muse-spark-1\.3 a partir del caption y de la transcripción/);
  assert.match(html, /muse-voice-transcribe-1\.0 \(audio\)/);
  const rejected = await completeWithLlm(spoken, metaCfg(), async () => payload(good({
    quote: "cita inventada que no está",
  })));
  assert.equal(rejected.quote, extractQuote(post.caption));
  assert.equal(post.caption.includes(rejected.quote), true);
});

test("un error HTTP del modelo cae a la plantilla", async () => {
  const post = await demoPost();
  const enriched = await enrichPost(post, metaCfg(), async () => ({ ok: false, status: 401, json: async () => ({}) }));
  assert.equal(enriched.textSource, "template");
  assert.match(enriched.llmError, /401/);
});
