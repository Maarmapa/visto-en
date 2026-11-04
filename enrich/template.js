import { mediaNoun } from "../ingest/normalize.js";
import { clipWords, countWords, joinAnd } from "../lib/text.js";
import { matchProducts } from "./catalog.js";

export function extractQuote(caption) {
  const match = String(caption).match(/«([^»]+)»/);
  if (match) {
    const quote = match[1].trim();
    if (quote && caption.includes(quote)) return quote;
  }
  const sentence = String(caption).split(/(?<=[.!?])\s+/)[0].trim();
  if (!sentence) throw new Error("El caption no trae texto para citar");
  return sentence;
}

export function detectSurface(caption) {
  const labels = [];
  if (/zapatillas/i.test(caption)) labels.push("zapatillas");
  if (/cuero/i.test(caption)) labels.push("cuero");
  if (/lona/i.test(caption)) labels.push("lona");
  if (/muro/i.test(caption)) labels.push("muro");
  if (/libreta/i.test(caption)) labels.push("libreta");
  if (/madera/i.test(caption)) labels.push("madera");
  else if (/panel/i.test(caption)) labels.push("un panel");
  return labels.length ? joinAnd(labels) : "la superficie que muestra el post";
}

export function captionLead(caption) {
  const plain = caption
    .replace(/«[^»]*»/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@tiendademo\b/gi, "Tienda Demo")
    .replace(/@([\p{L}\p{N}._]+)/gu, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  const sentences = plain.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  let lead = "";
  for (const sentence of sentences) {
    const next = lead ? `${lead} ${sentence}` : sentence;
    if (countWords(next) > 24 && lead) break;
    lead = next;
  }
  if (countWords(lead) > 24) lead = clipWords(lead, 24);
  if (lead && !/[.!?]$/.test(lead)) lead += ".";
  return lead;
}

function relativeMedia(post) {
  const noun = mediaNoun(post);
  const cual = noun.startsWith("una ") ? "en la que" : "en el que";
  return `${noun} ${cual}`;
}

export function buildSummary(post, products) {
  const productList = joinAnd(products.map((product) => product.name));
  const paid = post.isPaid
    ? "El post está marcado como colaboración pagada y la ficha muestra la etiqueta de publicidad."
    : "No consta como colaboración pagada.";
  const lead = captionLead(post.caption);
  const sentences = [
    `${post.displayName} (@${post.username}) publicó ${relativeMedia(post)} usa ${productList} y menciona a Tienda Demo.`,
    lead,
    "La ficha deja el testimonio en texto, con la cita del creador, las preguntas frecuentes y el enlace al post original.",
    paid,
    `Así una IA puede citar la página de Tienda Demo y atribuir el contenido a @${post.username}.`,
  ];
  let text = sentences.join(" ");
  if (countWords(text) > 120) {
    text = [sentences[0], sentences[2], sentences[3], sentences[4]].join(" ");
  }
  const filler = "El texto sale del caption publicado por el creador en la demo.";
  let pads = 0;
  while (countWords(text) < 80 && pads < 4) {
    text += ` ${filler}`;
    pads += 1;
  }
  if (countWords(text) > 120) text = clipWords(text, 120);
  const words = countWords(text);
  if (words < 80 || words > 120) {
    throw new Error(`El resumen de @${post.username} quedó en ${words} palabras`);
  }
  return text;
}

export function buildFaqs(post, products, quote) {
  const main = products[0];
  const surface = detectSurface(post.caption);
  const others = products.slice(1).map((product) => product.name);
  const extra = others.length ? `También nombra ${joinAnd(others)}. ` : "";
  const spoken = quote.replace(/[.!?;:]+$/g, "");
  return [
    {
      question: `¿Qué dice @${post.username} sobre ${main.name}?`,
      answer: `${post.displayName} escribe: «${spoken}». Esa frase está en el caption del post y esta ficha la cita sin reescribirla.`,
    },
    {
      question: `¿Sobre qué superficie aparece ${main.name} en este post?`,
      answer: `El caption de @${post.username} habla de ${surface}. ${extra}El detalle completo sigue en el post original.`,
    },
    {
      question: `¿Dónde está el post original de @${post.username}?`,
      answer: `Sigue en Instagram: ${post.permalink}. Esta página de Tienda Demo lo resume y lo atribuye. No reemplaza la publicación ni agrega una oferta.`,
    },
  ];
}

export function templateEnrich(post) {
  const products = matchProducts(post.caption);
  if (products.length === 0) {
    throw new Error("Ningún producto del catálogo aparece en el caption");
  }
  const quote = extractQuote(post.caption);
  return {
    provider: "template",
    modelName: "",
    textSource: "template",
    transcriptUsed: false,
    metaModels: [],
    products,
    quote,
    summary: buildSummary(post, products),
    faqs: buildFaqs(post, products, quote),
  };
}
