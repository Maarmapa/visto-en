import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "../ingest/run.js";
import { loadConfig, requireMetaKey } from "../lib/config.js";
import { generateMissingImages } from "../media/images.js";
import { transcribeMissing } from "../media/transcribe.js";
import { report, runDemo } from "./demo.js";

export async function runDemoMuse(options = {}) {
  const env = {
    ...(options.env || process.env),
    MOCK: "1",
    INGEST_MOCK: "1",
    LLM_PROVIDER: "meta",
  };
  const cfg = loadConfig(env);
  requireMetaKey(cfg);
  const fetchImpl = options.fetchImpl || fetch;
  const posts = await ingest(cfg, fetchImpl);
  const images = await generateMissingImages(posts, cfg, fetchImpl, options);
  const transcripts = await transcribeMissing(posts, cfg, fetchImpl, options);
  const demo = await runDemo({ env, fetchImpl });
  return { images, transcripts, demo, cfg };
}

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  runDemoMuse().then(({ images, transcripts, demo }) => {
    console.log(`Imágenes nuevas: ${images.created.length}. Ya estaban: ${images.skipped.length}.`);
    console.log(`Transcripciones nuevas: ${transcripts.created.length}. Ya estaban: ${transcripts.skipped.length}.`);
    report(demo);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
