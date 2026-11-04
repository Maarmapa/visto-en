import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "../ingest/run.js";
import { loadConfig } from "../lib/config.js";
import { transcribeMissing } from "../media/transcribe.js";

export async function runTranscribir(options = {}) {
  const env = { ...(options.env || process.env), INGEST_MOCK: "1" };
  const cfg = loadConfig(env);
  const fetchImpl = options.fetchImpl || fetch;
  const posts = await ingest(cfg, fetchImpl);
  const transcripts = await transcribeMissing(posts, cfg, fetchImpl, options);
  return { cfg, posts, transcripts };
}

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  runTranscribir().then(({ transcripts }) => {
    console.log(`Transcripciones nuevas: ${transcripts.created.length}. Ya estaban: ${transcripts.skipped.length}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
