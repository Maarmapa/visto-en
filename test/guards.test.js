import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sendConsent } from "../consent/payload.js";
import { writeConsent } from "../consent/run.js";
import { templateEnrich } from "../enrich/template.js";
import { fetchOembedHtml, fetchTags, graphGet } from "../ingest/graph.js";
import { normalizeMedia } from "../ingest/normalize.js";
import { ROOT, loadConfig } from "../lib/config.js";
import { classifyCitation, queryEngine } from "../measure/engines.js";
import { parsePrompts } from "../measure/prompts.js";
import { pingIndexNow, renderLlmsTxt } from "../site/feeds.js";
import { buildPage } from "../site/page.js";
import { renderPost } from "../site/render.js";

const mockCfg = loadConfig({
  MOCK: "1",
  INGEST_MOCK: "1",
  META_ACCESS_TOKEN: "token-de-prueba",
  IG_USER_ID: "12345",
  WHATSAPP_TOKEN: "token-de-prueba",
  WHATSAPP_PHONE_NUMBER_ID: "12345",
  INDEXNOW_KEY: "index-now-de-prueba",
  MEASURE_LIVE: "1",
  PERPLEXITY_API_KEY: "token-de-prueba",
  OPENAI_API_KEY: "token-de-prueba",
  LLM_PROVIDER: "template",
});

test("con todos los tokens, solo el modo mock bloquea la red", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    throw new Error("no debía llamar a fetch");
  };
  await assert.rejects(() => fetchTags(mockCfg, fetchImpl), /modo mock/);
  await assert.rejects(() => fetchOembedHtml("https://www.instagram.com/p/DEMO0001/", mockCfg, fetchImpl), /modo mock/);
  await assert.rejects(() => queryEngine("perplexity", "hola", mockCfg, fetchImpl), /modo mock/);
  await assert.rejects(() => queryEngine("chatgpt", "hola", mockCfg, fetchImpl), /modo mock/);
  await assert.rejects(() => sendConsent({ message: {} }, mockCfg, fetchImpl), /modo mock/);
  await assert.rejects(() => pingIndexNow({ host: "tienda-demo.example", urlList: [] }, mockCfg, fetchImpl), /modo mock/);
  assert.equal(calls, 0);
});

test("sin mock, falta el token y el mensaje no dice modo mock", async () => {
  const cfg = loadConfig({ MOCK: "0", INGEST_MOCK: "0", MEASURE_LIVE: "1", LLM_PROVIDER: "template" });
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    throw new Error("no debía llamar a fetch");
  };
  await assert.rejects(() => fetchTags(cfg, fetchImpl), /falta META_ACCESS_TOKEN/);
  await assert.rejects(() => sendConsent({ message: {} }, cfg, fetchImpl), /falta WHATSAPP_TOKEN/);
  await assert.rejects(() => pingIndexNow({ host: "tienda-demo.example", urlList: [] }, cfg, fetchImpl), /falta INDEXNOW_KEY/);
  await assert.rejects(() => queryEngine("perplexity", "hola", cfg, fetchImpl), /falta PERPLEXITY_API_KEY/);
  await assert.rejects(() => queryEngine("chatgpt", "hola", cfg, fetchImpl), /falta OPENAI_API_KEY/);
  assert.equal(calls, 0);
});

test("Graph API manda el token en el header y no en la URL", async () => {
  const cfg = loadConfig({
    MOCK: "0",
    IG_USER_ID: "12345",
    META_ACCESS_TOKEN: "token-de-prueba",
    GRAPH_API_VERSION: "v25.0",
  });
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), authorization: init.headers.Authorization });
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  };
  const posts = await fetchTags(cfg, fetchImpl);
  assert.deepEqual(posts, []);
  assert.equal(seen.length, 1);
  const url = new URL(seen[0].url);
  assert.equal(url.hostname, "graph.facebook.com");
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(seen[0].authorization, "Bearer token-de-prueba");
  await assert.rejects(() => graphGet(cfg, "12345/tags", { access_token: "no" }, fetchImpl), /header/);
});

test("classifyCitation reconoce dominio, ficha y creador", () => {
  const cfg = loadConfig({ SITE_BASE_URL: "https://tienda-demo.example" });
  const pages = [{
    url: "https://tienda-demo.example/visto-en/artista_demo_1/demo0001/",
    post: { username: "artista_demo_1" },
  }];
  const hit = classifyCitation(
    "Vi la ficha https://tienda-demo.example/visto-en/artista_demo_1/demo0001/ de @artista_demo_1",
    cfg,
    pages,
  );
  assert.deepEqual(hit, {
    citesDomain: 1,
    citesPage: 1,
    citesCreator: 1,
    citedUrl: pages[0].url,
    citedCreator: "artista_demo_1",
  });
  const miss = classifyCitation("No hay fuentes.", cfg, pages);
  assert.equal(miss.citesDomain, 0);
  assert.equal(miss.citesPage, 0);
  assert.equal(miss.citesCreator, 0);
});

test("prompts.yaml trae entre 10 y 20 preguntas", () => {
  const prompts = parsePrompts(readFileSync(join(ROOT, "fixtures", "prompts.yaml"), "utf8"));
  assert.ok(prompts.length >= 10 && prompts.length <= 20);
  assert.equal(prompts[0].id, "q01");
  assert.equal(prompts.at(-1).after.chatgpt, undefined);
});

function sampleMedia(overrides = {}) {
  return {
    id: "42",
    username: "artista_demo_1",
    permalink: "https://www.instagram.com/p/DEMO0001/",
    caption: "Prueba con Posca. «Posca cubre el trazo.»",
    timestamp: "2026-10-02T15:04:00+0000",
    ...overrides,
  };
}

test("la publicidad sale del caption o de Partnership Ads, no de un campo que la API no tiene", () => {
  assert.equal(normalizeMedia(sampleMedia({ is_paid_partnership: true }), "tags").isPaid, false);
  for (const tag of ["#publi", "#ad", "#publicidad", "#colaboracion", "#colaboración"]) {
    assert.equal(normalizeMedia(sampleMedia({ caption: `Hola ${tag} Posca. «Posca cubre.»` }), "tags").isPaid, true, tag);
  }
  assert.equal(normalizeMedia(sampleMedia({ caption: "Hay una paid partnership con Posca. «Posca cubre.»" }), "tags").isPaid, true);
  assert.equal(normalizeMedia(sampleMedia({ caption: "Hola #admin Posca. «Posca cubre.»" }), "tags").isPaid, false);
  assert.equal(normalizeMedia(sampleMedia({ partnership_ads: { paid: true } }), "tags").isPaid, true);
  assert.throws(() => normalizeMedia(sampleMedia({ audio_path: "../secreto.m4a" }), "tags"), /audio_path/);
  assert.throws(() => normalizeMedia(sampleMedia({ audio_path: "/tmp/nota.wav" }), "tags"), /audio_path/);
  assert.throws(() => normalizeMedia(sampleMedia({ audio_path: "media/nota.mp3" }), "tags"), /audio_path/);
  const withAudio = normalizeMedia(sampleMedia({
    audio_path: "media/demo0006.m4a",
    image_prompt: "spray-painted mural on a concrete wall, bright colors, no text",
    image_alt: "Mural de prueba",
  }), "tags");
  assert.equal(withAudio.audioPath, "media/demo0006.m4a");
  assert.equal(withAudio.imagePrompt, "spray-painted mural on a concrete wall, bright colors, no text");
  assert.equal(withAudio.imageAlt, "Mural de prueba");
});

test("permalink, id y usuario se rechazan antes de armar un archivo", () => {
  assert.throws(() => normalizeMedia(sampleMedia({ permalink: "javascript:alert(1)" }), "tags"), /Permalink/);
  assert.throws(() => normalizeMedia(sampleMedia({ permalink: "https://instagram.com/p/DEMO0001/" }), "tags"), /Permalink/);
  assert.throws(() => normalizeMedia(sampleMedia({ id: "../etc" }), "tags"), /Id de post/);
  assert.throws(() => normalizeMedia(sampleMedia({ username: ".." }), "tags"), /Usuario/);
  assert.equal(normalizeMedia(sampleMedia({ caption: "   " }), "tags"), null);
  const kept = normalizeMedia(sampleMedia(), "tags");
  assert.equal(kept.permalink, "https://www.instagram.com/p/DEMO0001/");
  assert.equal(kept.consentStatus, "pending");
});

test("un caption hostil no rompe el HTML ni llms.txt", () => {
  const cfg = loadConfig({ MOCK: "1", SITE_BASE_URL: "https://tienda-demo.example" });
  const post = normalizeMedia(sampleMedia({
    caption: "Prueba </script><img src=x onerror=alert(1)> con Posca. «Posca cubre el trazo en esta prueba hostil.»",
    display_name: "Nombre\n[click](http://evil.test) # > *",
  }), "tags", "Nombre\n[click](http://evil.test)");
  assert.equal(post.displayName.includes("\n"), false);
  const enriched = templateEnrich(post);
  const page = buildPage(post, enriched, cfg);
  const html = renderPost(page, cfg);
  assert.equal(/<img\b/i.test(html), false);
  const withoutLdOpen = html.replaceAll('<script type="application/ld+json">', "");
  assert.equal(/<script\b/i.test(withoutLdOpen), false);
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(ld.includes("<"), false);
  assert.equal(ld.includes(">"), false);
  assert.match(html, /&lt;img/);
  const llms = renderLlmsTxt([{
    title: "Titulo\n[click](http://evil.test) # > *",
    url: page.url,
    enriched: { summary: "Primera frase con [markdown](http://evil.test) y #titulo.\nSegunda frase." },
  }], cfg);
  const items = llms.split("\n").filter((line) => line.startsWith("- "));
  assert.equal(items.length, 1);
  assert.equal(items[0].includes("[click]"), false);
  assert.equal(items[0].includes("#titulo"), false);
  assert.equal(items[0].includes("](http://evil"), false);
});

test("el consentimiento no escribe fuera de su carpeta", async () => {
  const dir = await mkdtemp(join(tmpdir(), "visto-consent-"));
  try {
    assert.throws(() => writeConsent([{ username: "..", postId: "1" }], dir), /inválido/);
    assert.throws(() => writeConsent([{ username: "artista_demo_1", postId: "../1" }], dir), /inválido/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("el código y los fixtures no nombran la tienda real ni traen secretos", () => {
  const files = walk(ROOT).filter((file) => {
    const rel = relative(ROOT, file);
    // Los informes internos no salen en el export público (scripts/exportar-publico.sh).
    return !rel.startsWith(`docs${sep}`) && !rel.startsWith(`test${sep}`) && !/^INFORME-.*\.md$/.test(rel);
  });
  const banned = new RegExp(
    ["boy", "kot"].join("") + "|AKIA|ghp_|xox[baprs]-|BEGIN [A-Z ]*PRIVATE KEY|EAA[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|pplx-[A-Za-z0-9]{20,}",
    "i",
  );
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(banned.test(text), false, file);
  }
});

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "out" || name === "data" || name === ".git") continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, acc);
    else acc.push(file);
  }
  return acc;
}
