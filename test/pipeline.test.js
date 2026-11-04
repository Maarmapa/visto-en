import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, loadConfig } from "../lib/config.js";
import { openStore } from "../lib/store.js";
import { createStaticServer } from "../scripts/serve.js";
import { runDemo } from "../scripts/demo.js";
import { validateJsonLd } from "../site/jsonld.js";

function fixturesWithoutGeneratedMedia() {
  const scratch = mkdtempSync(join(tmpdir(), "visto-fix-"));
  const fixturesDir = join(scratch, "fixtures");
  cpSync(join(ROOT, "fixtures"), fixturesDir, { recursive: true });
  const media = join(fixturesDir, "media");
  for (const name of readdirSync(media)) {
    if (/^(manifest\.json|.*-transcript\.json|.*\.(png|webp|jpe?g))$/.test(name)) {
      rmSync(join(media, name));
    }
  }
  return { scratch, fixturesDir };
}

async function runIsolated() {
  const { scratch, fixturesDir } = fixturesWithoutGeneratedMedia();
  const root = scratch;
  const outDir = join(root, "out");
  const dataDir = join(root, "data");
  let networkCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    networkCalls += 1;
    throw new Error("red prohibida en modo mock");
  };
  try {
    const result = await runDemo({
      env: {
        MOCK: "1",
        INGEST_MOCK: "1",
        LLM_PROVIDER: "template",
        OUT_DIR: outDir,
        DATA_DIR: dataDir,
        FIXTURES_DIR: fixturesDir,
        SITE_BASE_URL: "https://tienda-demo.example",
        META_ACCESS_TOKEN: "token-de-prueba",
        PERPLEXITY_API_KEY: "token-de-prueba",
        OPENAI_API_KEY: "token-de-prueba",
        WHATSAPP_TOKEN: "token-de-prueba",
        WHATSAPP_PHONE_NUMBER_ID: "12345",
        INDEXNOW_KEY: "index-now-de-prueba",
        MEASURE_LIVE: "1",
      },
    });
    return { root, outDir, dataDir, result, networkCalls };
  } finally {
    globalThis.fetch = original;
  }
}

test("el modo mock corre de punta a punta sin red", async () => {
  const isolated = await runIsolated();
  try {
    assert.equal(isolated.networkCalls, 0);
    assert.equal(isolated.result.mode, "simulado");
    assert.ok(isolated.result.posts.length >= 5 && isolated.result.posts.length <= 8);
    assert.equal(isolated.result.consents.length, isolated.result.posts.length);
    assert.equal(isolated.result.held.length, 1);
    assert.equal(isolated.result.pages.length, isolated.result.posts.length - 1);
    assert.equal(isolated.result.held[0].post.consentStatus, "pending");
    assert.ok(isolated.result.consents.some((row) => row.status === "pending"));
    assert.ok(isolated.result.consents.filter((row) => row.status === "approved").length === isolated.result.pages.length);
    assert.ok(isolated.result.consents.every((row) => row.sent === false));
    assert.ok(isolated.result.consents.every((row) => row.message.to === "{{CREATOR_WHATSAPP_E164}}"));

    const before = isolated.result.measurements.filter((row) => row.phase === "before" && row.citesDomain);
    const after = isolated.result.measurements.filter((row) => row.phase === "after" && row.citesDomain);
    assert.equal(before.length, 0);
    assert.equal(after.length, 24);

    const store = await openStore(isolated.dataDir);
    try {
      assert.equal(store.kind, "sqlite");
      assert.equal(store.getPosts().length, isolated.result.posts.length);
      assert.equal(store.getMeasurements().length, isolated.result.measurements.length);
    } finally {
      store.close();
    }

    const sitemap = await readFile(join(isolated.outDir, "sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.ok(locs.includes("https://tienda-demo.example/"));
    assert.equal(locs.includes("https://tienda-demo.example/dashboard/"), false);
    const llms = await readFile(join(isolated.outDir, "llms.txt"), "utf8");
    const index = await readFile(join(isolated.outDir, "index.html"), "utf8");
    const held = isolated.result.held[0];
    assert.equal(locs.includes(held.url), false);
    assert.equal(llms.includes(held.url), false);
    assert.equal(index.includes(held.path), false);
    assert.match(index, /no se publica/);
    for (const page of isolated.result.pages) {
      assert.ok(locs.includes(page.url), page.url);
      assert.ok(llms.includes(page.url));
      const relative = page.file;
      const html = await readFile(join(isolated.outDir, relative), "utf8");
      assert.match(html, /<meta name="viewport"/);
      assert.match(html, /class="embed"/);
      assert.match(html, /<blockquote>/);
      assert.ok(html.includes(page.enriched.quote));
      assert.match(html, /Plantilla determinista, sin modelo/);
      assert.match(html, /Ningún modelo de Meta tocó esta ficha/);
      assert.match(html, /Sin foto real/);
      assert.equal(html.includes("<img"), false);
      if (page.post.isPaid) assert.equal(html.includes("No consta como colaboración pagada"), false);
      else assert.match(html, /No consta como colaboración pagada/);
      const jsonld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.deepEqual(validateJsonLd(jsonld), []);
      const paid = html.includes('class="ad-label"');
      assert.equal(paid, page.post.isPaid);
      const consentName = `${page.post.username}-${page.post.id}.json`;
      const consent = JSON.parse(await readFile(join(isolated.outDir, "consent", consentName), "utf8"));
      assert.equal(consent.status, "approved");
      assert.equal(JSON.stringify(consent).includes("+569"), false);
    }

    assert.match(index, /Visto en/);
    assert.equal(
      index.match(/Ningún modelo de Meta tocó esta ficha/g).length,
      isolated.result.pages.length,
    );
    const dashboard = await readFile(join(isolated.outDir, "dashboard", "index.html"), "utf8");
    assert.match(dashboard, /Antes \(simulado\)/);
    assert.match(dashboard, /Después \(simulado\)/);
    assert.match(dashboard, /36 consultas simuladas/);
    assert.match(dashboard, /sin API oficial: no se mide/);
    assert.equal(dashboard.includes(">24<"), false);
    assert.equal(dashboard.includes(">11<"), false);
    const indexnow = JSON.parse(await readFile(join(isolated.outDir, "indexnow.json"), "utf8"));
    assert.equal(indexnow.sent, false);
    assert.equal(indexnow.key, "(definida, no se muestra)");

    const server = createStaticServer(isolated.outDir);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const home = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(home.status, 200);
      assert.match(await home.text(), /artista_demo_1/);
      const sample = isolated.result.pages.find((page) => page.post.isPaid);
      const post = await fetch(`http://127.0.0.1:${port}${sample.path}`);
      assert.equal(post.status, 200);
      const postHtml = await post.text();
      assert.match(postHtml, /class="ad-label"/);
      assert.match(postHtml, /Abrir el post original/);
      const css = await fetch(`http://127.0.0.1:${port}/assets/visto.css`);
      assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
      assert.match(await css.text(), /@media/);
      const board = await fetch(`http://127.0.0.1:${port}/dashboard/`);
      assert.equal(board.status, 200);
      const xml = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
      assert.match(xml.headers.get("content-type"), /xml/);
      const missing = await fetch(`http://127.0.0.1:${port}/no-existe`);
      assert.equal(missing.status, 404);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("MOCK queda prendido si la variable no está", () => {
  const cfg = loadConfig({ META_ACCESS_TOKEN: "token-de-prueba", MEASURE_LIVE: "1" });
  assert.equal(cfg.mock, true);
  assert.equal(cfg.ingestMock, true);
  assert.equal(cfg.llmProvider, "template");
  assert.equal(cfg.measureLive, true);
});

test("LLM_PROVIDER explícito no lo apaga MOCK", () => {
  const cfg = loadConfig({ MOCK: "1", LLM_PROVIDER: "meta" });
  assert.equal(cfg.mock, true);
  assert.equal(cfg.ingestMock, true);
  assert.equal(cfg.llmProvider, "meta");
  assert.equal(cfg.metaModelName, "muse-spark-1.3");
  assert.equal(cfg.metaModelApiUrl, "https://api.meta.ai/v1/chat/completions");
  assert.equal(cfg.metaImageModel, "muse-image-1.0");
  assert.equal(cfg.metaImageEndpoint, "https://api.meta.ai/v1/images/generations");
  assert.equal(cfg.metaTranscribeModel, "muse-voice-transcribe-1.0");
  assert.equal(cfg.metaTranscribeEndpoint, "https://api.meta.ai/v1/asr/transcribe");
  const liveIngest = loadConfig({ INGEST_MOCK: "0" });
  assert.equal(liveIngest.mock, true);
  assert.equal(liveIngest.ingestMock, false);
});

test("un directorio fuera del repo no se borra", async () => {
  const root = await mkdtemp(join(tmpdir(), "visto-fuera-"));
  const outDir = join(root, "out");
  const dataDir = join(root, "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "conservar.txt"), "sigue");
  try {
    const result = await runDemo({
      env: {
        MOCK: "1",
        INGEST_MOCK: "1",
        LLM_PROVIDER: "template",
        OUT_DIR: outDir,
        DATA_DIR: dataDir,
      },
    });
    assert.equal(await readFile(join(outDir, "conservar.txt"), "utf8"), "sigue");
    assert.match(await readFile(join(outDir, "index.html"), "utf8"), /Visto en/);
    assert.ok(result.pages.length >= 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
