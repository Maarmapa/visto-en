import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, renameSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { consentForPages, writeConsent } from "../consent/run.js";
import { enrichPost } from "../enrich/run.js";
import { ingest } from "../ingest/run.js";
import { assertWritableDir, isInsideRepo, loadConfig, requireMetaKey } from "../lib/config.js";
import { openStore } from "../lib/store.js";
import { measure, writeDashboard } from "../measure/run.js";
import { writeSite } from "../site/run.js";
import { buildPage } from "../site/page.js";

export function publishDir(staging, target) {
  if (!isInsideRepo(target)) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(staging)) {
      cpSync(join(staging, entry), join(target, entry), { recursive: true, force: true });
    }
    return;
  }
  const next = `${target}.visto-next`;
  rmSync(next, { recursive: true, force: true });
  cpSync(staging, next, { recursive: true });
  rmSync(target, { recursive: true, force: true });
  try {
    renameSync(next, target);
  } catch (error) {
    if (!existsSync(target) && existsSync(next)) renameSync(next, target);
    throw error;
  }
}

export async function runDemo(options = {}) {
  const env = options.env || process.env;
  const cfg = loadConfig(env);
  const fetchImpl = options.fetchImpl || fetch;
  const outDir = assertWritableDir(cfg.outDir);
  const dataDir = assertWritableDir(cfg.dataDir);
  if (cfg.llmProvider === "meta") requireMetaKey(cfg);
  const stagingOut = mkdtempSync(join(tmpdir(), "visto-out-"));
  const stagingData = mkdtempSync(join(tmpdir(), "visto-data-"));
  let store;
  try {
    store = await openStore(stagingData);
    const posts = await ingest(cfg, fetchImpl);
    store.replacePosts(posts);
    const built = [];
    for (const post of posts) {
      try {
        const enriched = await enrichPost(post, cfg, fetchImpl);
        built.push(buildPage(post, enriched, cfg));
      } catch (error) {
        console.error(`Se omite @${post.username}: ${error.message}`);
      }
    }
    const consents = consentForPages(built, cfg);
    const approvedIds = new Set(
      consents.filter((row) => row.status === "approved").map((row) => row.postId),
    );
    const pages = built.filter((page) => approvedIds.has(page.post.id));
    const held = built.filter((page) => !approvedIds.has(page.post.id));
    store.replacePages(pages);
    writeSite(pages, cfg, stagingOut, { held: held.length });
    store.replaceConsent(consents);
    writeConsent(consents, stagingOut);
    const measured = await measure(built, cfg, fetchImpl);
    store.replaceMeasurements(measured.measurements);
    writeDashboard(measured.measurements, measured.prompts, cfg, stagingOut);
    store.close();
    store = null;
    publishDir(stagingOut, outDir);
    publishDir(stagingData, dataDir);
    return {
      posts,
      pages,
      held,
      consents,
      measurements: measured.measurements,
      mode: measured.mode,
      outDir,
      dataDir,
      cfg,
    };
  } finally {
    if (store) store.close();
    rmSync(stagingOut, { recursive: true, force: true });
    rmSync(stagingData, { recursive: true, force: true });
  }
}

export function report(result) {
  const paid = result.posts.filter((post) => post.isPaid).length;
  const before = result.measurements.filter((row) => row.phase === "before" && row.citesDomain && row.engine !== "google_ai_overview").length;
  const after = result.measurements.filter((row) => row.phase === "after" && row.citesDomain && row.engine !== "google_ai_overview").length;
  const example = result.pages[0];
  const fromModel = [...result.pages, ...result.held].filter((page) => page.enriched.textSource === "llm");
  console.log(`Ingesta: ${result.posts.length} posts (${paid} con publicidad en el caption).`);
  if (fromModel.length) {
    console.log(`Enriquecimiento: ${fromModel.length} con ${fromModel[0].enriched.modelName}.`);
  } else {
    console.log("Enriquecimiento: plantilla determinista, sin modelo.");
  }
  console.log(`Páginas publicadas: ${result.pages.length} en ${result.outDir}`);
  console.log(`Fuera por consentimiento: ${result.held.length}.`);
  if (example) console.log(`Ejemplo: ${example.file}`);
  console.log(`Consentimiento: ${result.consents.length} payloads, ninguno enviado.`);
  console.log(`Medición simulada: citas al dominio antes ${before}, después ${after}.`);
  console.log("Servir: make serve → http://127.0.0.1:4321/");
}

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  runDemo().then(report).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
