import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "../ingest/run.js";
import { loadConfig } from "../lib/config.js";
import { generateMissingImages } from "../media/images.js";

export async function runImagenes(options = {}) {
  const env = { ...(options.env || process.env), INGEST_MOCK: "1" };
  const cfg = loadConfig(env);
  const fetchImpl = options.fetchImpl || fetch;
  const posts = await ingest(cfg, fetchImpl);
  const images = await generateMissingImages(posts, cfg, fetchImpl, options);
  return { cfg, posts, images };
}

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  runImagenes().then(({ images }) => {
    console.log(`Imágenes nuevas: ${images.created.length}. Ya estaban: ${images.skipped.length}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
