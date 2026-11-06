import assert from "node:assert/strict";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, loadConfig } from "../lib/config.js";
import { normalizeMedia } from "../ingest/normalize.js";
import { findImageForPost, generateMissingImages } from "../media/images.js";
import { buildMultipart, transcribeMissing } from "../media/transcribe.js";
import { createStaticServer } from "../scripts/serve.js";
import { runDemoMuse } from "../scripts/demo-muse.js";
import { enrichPost } from "../enrich/run.js";
import { buildPage } from "../site/page.js";
import { renderPost } from "../site/render.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WHEN = "2026-11-04T18:00:00.000Z";
const KEY = "llave-de-prueba";

function words(count) {
  return Array.from({ length: count }, (_, index) => `palabra${index}`).join(" ");
}

function imageResponse(bytes = PNG, format = "png") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      created: 1784584435,
      data: [{ b64_json: Buffer.from(bytes).toString("base64") }],
      output_format: format,
    }),
  };
}

async function tempFixtures() {
  const root = await mkdtemp(join(tmpdir(), "visto-media-"));
  const fixturesDir = join(root, "fixtures");
  const mediaDir = join(fixturesDir, "media");
  await mkdir(mediaDir, { recursive: true });
  const cfg = (extra = {}) => loadConfig({
    FIXTURES_DIR: fixturesDir,
    META_MODEL_API_KEY: KEY,
    LLM_PROVIDER: "meta",
    INGEST_MOCK: "1",
    MOCK: "1",
    ...extra,
  });
  return { root, fixturesDir, mediaDir, cfg };
}

function muralPost(extra = {}) {
  return normalizeMedia({
    id: "42",
    username: "artista_demo_1",
    display_name: "Lina Soto Demo",
    permalink: "https://www.instagram.com/p/DEMO0042/",
    caption: "Prueba con Posca. «Posca cubre el trazo.»",
    timestamp: "2026-10-02T15:04:00+0000",
    image_prompt: "spray-painted mural on a concrete wall, bright colors, no text",
    image_alt: "Mural <img alt=\"x\">",
    ...extra,
  }, "tags");
}

test("sin llave no se pide la imagen ni se escribe el archivo", async () => {
  const isolated = await tempFixtures();
  try {
    let calls = 0;
    const cfg = isolated.cfg({ META_MODEL_API_KEY: "" });
    await assert.rejects(
      () => generateMissingImages([muralPost()], cfg, () => {
        calls += 1;
        throw new Error("no debía llamar a fetch");
      }),
      /falta META_MODEL_API_KEY/,
    );
    assert.equal(calls, 0);
    assert.equal(existsSync(join(isolated.mediaDir, "42.png")), false);
    assert.equal(existsSync(join(isolated.mediaDir, "manifest.json")), false);
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("la imagen usa images/generations, guarda png y manifest, y no repite", async () => {
  const isolated = await tempFixtures();
  try {
    const seen = [];
    const cfg = isolated.cfg();
    const post = muralPost();
    const first = await generateMissingImages([post], cfg, async (url, init) => {
      seen.push({ url: String(url), init });
      return imageResponse();
    }, { now: () => WHEN });
    assert.deepEqual(first.created, ["42"]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://api.meta.ai/v1/images/generations");
    assert.equal(seen[0].init.method, "POST");
    assert.equal(seen[0].init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(seen[0].init.headers["Content-Type"], "application/json");
    const body = JSON.parse(seen[0].init.body);
    assert.equal(body.model, "muse-image-1.0");
    assert.equal(body.prompt, post.imagePrompt);
    assert.equal(body.n, 1);
    assert.equal(body.response_format, "b64_json");
    assert.equal(body.output_format, "png");
    assert.equal(body.tool_enablement.enable_web_search, false);
    assert.equal(body.tool_enablement.enable_image_search, false);
    assert.equal(seen[0].init.body.includes(KEY), false);
    const png = await readFile(join(isolated.mediaDir, "42.png"));
    assert.deepEqual(png, PNG);
    const manifest = JSON.parse(await readFile(join(isolated.mediaDir, "manifest.json"), "utf8"));
    assert.equal(manifest.updated, WHEN);
    assert.equal(manifest.images.length, 1);
    assert.equal(manifest.images[0].post_id, "42");
    assert.equal(manifest.images[0].file, "42.png");
    assert.equal(manifest.images[0].model, "muse-image-1.0");
    assert.equal(manifest.images[0].prompt, post.imagePrompt);
    assert.equal(manifest.images[0].alt, post.imageAlt);
    assert.equal(manifest.images[0].created, WHEN);
    assert.equal(manifest.images[0].endpoint, "https://api.meta.ai/v1/images/generations");
    assert.equal(JSON.stringify(manifest).includes(KEY), false);
    let againCalls = 0;
    const second = await generateMissingImages([post], cfg, () => {
      againCalls += 1;
      throw new Error("no debía repetir");
    });
    assert.equal(againCalls, 0);
    assert.deepEqual(second.skipped, ["42"]);
    const enriched = await enrichPost(post, loadConfig({
      MOCK: "1",
      INGEST_MOCK: "1",
      LLM_PROVIDER: "template",
      FIXTURES_DIR: isolated.fixturesDir,
    }));
    const html = renderPost(buildPage(post, enriched, cfg), cfg);
    assert.match(html, /src="\/media\/42\.png"/);
    assert.match(html, /alt="Mural &lt;img alt=&quot;x&quot;&gt;"/);
    assert.match(html, /Imagen sintética generada con muse-image-1\.0 para la demo/);
    assert.match(html, /Modelos de Meta en esta ficha: muse-image-1\.0 \(imagen\)\./);
    assert.equal(html.includes("<img alt=\"x\">"), false);
    assert.match(html, /Plantilla determinista, sin modelo/);
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("un error de la imagen no deja archivo y un manifest hostil no sale de media", async () => {
  const isolated = await tempFixtures();
  try {
    const cfg = isolated.cfg();
    const post = muralPost();
    await assert.rejects(
      () => generateMissingImages([post], cfg, async () => ({ ok: false, status: 503, json: async () => ({}) })),
      /La imagen respondió 503/,
    );
    assert.equal(existsSync(join(isolated.mediaDir, "42.png")), false);
    await writeFile(join(isolated.mediaDir, "manifest.json"), `${JSON.stringify({
      images: [{ post_id: "42", file: "../fuera.png", model: "muse-image-1.0", prompt: "x", alt: "x" }],
    })}\n`);
    assert.equal(findImageForPost(post, cfg), null);
    await writeFile(join(isolated.mediaDir, "42.png"), PNG);
    const orphan = findImageForPost(post, cfg);
    assert.equal(orphan.file, "42.png");
    assert.equal(orphan.model, "");
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("la transcripción manda wav en multipart a /asr/transcribe y no repite", async () => {
  const isolated = await tempFixtures();
  try {
    const wav = Buffer.from("RIFF-demo-wav");
    await writeFile(join(isolated.mediaDir, "clip.m4a"), "no-es-wav");
    const post = muralPost({
      id: "9000000000000006",
      username: "artista_demo_6",
      audio_path: "media/clip.m4a",
      audio_language: "Spanish",
    });
    const cfg = isolated.cfg({
      META_TRANSCRIBE_ENDPOINT: "https://ejemplo.test/asr",
      META_TRANSCRIBE_MODEL: "muse-voice-transcribe-1.0",
    });
    let conversions = 0;
    const seen = [];
    const done = await transcribeMissing([post], cfg, async (url, init) => {
      seen.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ transcript: "Texto oído en el reel." }),
      };
    }, {
      now: () => WHEN,
      convertImpl: (audioAbs) => {
        conversions += 1;
        assert.match(audioAbs, /clip\.m4a$/);
        return wav;
      },
    });
    assert.deepEqual(done.created, ["9000000000000006"]);
    assert.equal(conversions, 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://ejemplo.test/asr");
    assert.equal(seen[0].init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(seen[0].init.headers.Accept, "application/json");
    assert.match(seen[0].init.headers["Content-Type"], /multipart\/form-data/);
    const raw = Buffer.from(seen[0].init.body);
    assert.equal(raw.includes(wav), true);
    assert.equal(raw.includes(KEY), false);
    assert.match(raw.toString("utf8"), /"model":"muse-voice-transcribe-1\.0"/);
    assert.match(raw.toString("utf8"), /"audioEncoding":"WAV"/);
    assert.match(raw.toString("utf8"), /"languageBias":\["Spanish"\]/);
    assert.match(raw.toString("utf8"), /filename="clip\.wav"/);
    const saved = JSON.parse(await readFile(join(isolated.mediaDir, "clip-transcript.json"), "utf8"));
    assert.equal(saved.transcript, "Texto oído en el reel.");
    assert.equal(saved.model, "muse-voice-transcribe-1.0");
    assert.equal(saved.created, WHEN);
    assert.equal(saved.audio_path, "media/clip.m4a");
    assert.equal(JSON.stringify(saved).includes(KEY), false);
    let again = 0;
    const skipped = await transcribeMissing([post], cfg, () => {
      again += 1;
      throw new Error("no debía repetir");
    }, { convertImpl: () => { throw new Error("no debía convertir"); } });
    assert.equal(again, 0);
    assert.deepEqual(skipped.skipped, ["9000000000000006"]);
    const direct = buildMultipart({ requestJson: "{}", filename: "a.wav", bytes: wav });
    assert.equal(Buffer.from(direct.body).includes(wav), true);
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("un wav se manda tal cual y sin llave no hay fetch", async () => {
  const isolated = await tempFixtures();
  try {
    const wav = Buffer.from("RIFF-directo");
    await writeFile(join(isolated.mediaDir, "nota.wav"), wav);
    const post = muralPost({ audio_path: "media/nota.wav" });
    let conversions = 0;
    const cfg = isolated.cfg();
    await transcribeMissing([post], cfg, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ transcript: "Hola desde el wav." }),
    }), {
      convertImpl: () => {
        conversions += 1;
        return wav;
      },
    });
    assert.equal(conversions, 0);
    const noKey = isolated.cfg({ META_MODEL_API_KEY: "" });
    const other = muralPost({ id: "43", audio_path: "media/nota.wav" });
    let calls = 0;
    await assert.rejects(() => transcribeMissing([other], noKey, () => {
      calls += 1;
      throw new Error("no debía llamar a fetch");
    }), /falta META_MODEL_API_KEY/);
    assert.equal(calls, 0);
  } finally {
    await rm(isolated.root, { recursive: true, force: true });
  }
});

test("demo-muse sin llave no llama a la red ni toca out", async () => {
  const root = await mkdtemp(join(tmpdir(), "visto-muse-no-"));
  const outDir = join(root, "out");
  const dataDir = join(root, "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "conservar.txt"), "sigue");
  let calls = 0;
  try {
    await assert.rejects(() => runDemoMuse({
      env: {
        OUT_DIR: outDir,
        DATA_DIR: dataDir,
        META_MODEL_API_KEY: "",
        META_ACCESS_TOKEN: "no-usar",
      },
      fetchImpl: () => {
        calls += 1;
        throw new Error("no debía llamar a fetch");
      },
    }), /falta META_MODEL_API_KEY/);
    assert.equal(calls, 0);
    assert.equal(await readFile(join(outDir, "conservar.txt"), "utf8"), "sigue");
    assert.equal(existsSync(join(outDir, "index.html")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("demo-muse con fetch falso arma imagen, transcripción y fichas", async () => {
  const repoManifest = join(ROOT, "fixtures", "media", "manifest.json");
  const repoManifestBefore = existsSync(repoManifest) ? readFileSync(repoManifest) : null;
  const root = await mkdtemp(join(tmpdir(), "visto-muse-"));
  const fixturesDir = join(root, "fixtures");
  const outDir = join(root, "out");
  const dataDir = join(root, "data");
  cpSync(join(ROOT, "fixtures"), fixturesDir, { recursive: true });
  // Media generada por demo-muse vive en fixtures/media; el test la borra
  // del clon temporal para forzar otra pasada con fetch falso.
  const mediaDir = join(fixturesDir, "media");
  for (const name of readdirSync(mediaDir)) {
    if (/\.png$/i.test(name) || name === "manifest.json" || name.endsWith("-transcript.json")) {
      rmSync(join(mediaDir, name), { force: true });
    }
  }
  const guion = readFileSync(join(ROOT, "fixtures", "media", "demo0006-guion.txt"), "utf8").trim();
  const transcriptQuote = "Primero di una base, porque sin base la pintura se cuartea al doblar la tela.";
  assert.equal(guion.includes(transcriptQuote), true);
  const seen = [];
  let conversions = 0;
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    seen.push({ url: href, init });
    if (href.includes("/images/generations")) return imageResponse();
    if (href.includes("/asr/transcribe")) {
      return { ok: true, status: 200, json: async () => ({ transcript: guion, turns: [] }) };
    }
    if (href.includes("/chat/completions")) {
      const content = JSON.parse(init.body).messages[0].content;
      const marked = content.match(/«([^»]+)»/);
      const quote = content.includes("Transcripción:") ? transcriptQuote : marked[1].trim();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                products: [],
                summary: words(90),
                faqs: [
                  { question: "¿Una?", answer: "La primera." },
                  { question: "¿Dos?", answer: "La segunda." },
                  { question: "¿Tres?", answer: "La tercera." },
                ],
                quote,
              }),
            },
          }],
        }),
      };
    }
    throw new Error(`url inesperada ${href}`);
  };
  try {
    const result = await runDemoMuse({
      env: {
        OUT_DIR: outDir,
        DATA_DIR: dataDir,
        FIXTURES_DIR: fixturesDir,
        SITE_BASE_URL: "https://tienda-demo.example",
        META_MODEL_API_KEY: KEY,
      },
      fetchImpl,
      now: () => WHEN,
      convertImpl: () => {
        conversions += 1;
        return Buffer.from("RIFF-reel");
      },
    });
    assert.equal(conversions, 1);
    assert.equal(result.images.created.length, 7);
    assert.equal(result.transcripts.created.length, 1);
    assert.equal(seen.filter((call) => call.url.includes("/images/generations")).length, 7);
    assert.equal(seen.filter((call) => call.url.includes("/asr/transcribe")).length, 1);
    assert.equal(seen.filter((call) => call.url.includes("/chat/completions")).length, 7);
    assert.equal(seen.some((call) => call.init?.body && Buffer.from(call.init.body).includes(KEY)), false);
    const reel = result.demo.pages.find((page) => page.post.username === "artista_demo_6");
    const paid = result.demo.pages.find((page) => page.post.username === "artista_demo_1");
    assert.equal(reel.post.caption.includes(transcriptQuote), false);
    assert.equal(reel.enriched.quote, transcriptQuote);
    const reelHtml = await readFile(join(outDir, reel.file), "utf8");
    assert.match(reelHtml, /Imagen sintética generada con muse-image-1\.0 para la demo/);
    assert.match(reelHtml, /Zapatillas de lona sobre una mesa/);
    assert.match(reelHtml, /muse-spark-1\.3 \(texto\), muse-image-1\.0 \(imagen\), muse-voice-transcribe-1\.0 \(audio\)/);
    assert.match(reelHtml, /a partir del caption y de la transcripción/);
    assert.equal(reelHtml.includes("Sin foto real"), false);
    const paidHtml = await readFile(join(outDir, paid.file), "utf8");
    assert.match(paidHtml, /muse-spark-1\.3 \(texto\), muse-image-1\.0 \(imagen\)\./);
    assert.equal(paidHtml.includes("muse-voice-transcribe"), false);
    const index = await readFile(join(outDir, "index.html"), "utf8");
    assert.equal(index.match(/muse-image-1\.0 \(imagen\)/g).length, result.demo.pages.length);
    assert.equal(index.match(/muse-voice-transcribe-1\.0 \(audio\)/g).length, 1);
    assert.equal(index.includes("artista_demo_7"), false);
    assert.equal(existsSync(join(fixturesDir, "media", "9000000000000007.png")), true);
    assert.equal(existsSync(join(outDir, "media", "9000000000000007.png")), false);
    const server = createStaticServer(outDir);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const png = await fetch(`http://127.0.0.1:${port}/media/${paid.enriched.image.file}`);
      assert.equal(png.status, 200);
      assert.equal(png.headers.get("content-type"), "image/png");
      const page = await fetch(`http://127.0.0.1:${port}${reel.path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Imagen sintética generada con muse-image-1\.0 para la demo/);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    let repeated = 0;
    const imagesAgain = await generateMissingImages(result.demo.posts, result.cfg, () => {
      repeated += 1;
      throw new Error("no debía repetir imágenes");
    });
    const audioAgain = await transcribeMissing(result.demo.posts, result.cfg, () => {
      repeated += 1;
      throw new Error("no debía repetir audio");
    });
    assert.equal(repeated, 0);
    assert.equal(imagesAgain.created.length, 0);
    assert.equal(audioAgain.created.length, 0);
    const afterRepo = existsSync(repoManifest) ? readFileSync(repoManifest) : null;
    assert.deepEqual(afterRepo, repoManifestBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
