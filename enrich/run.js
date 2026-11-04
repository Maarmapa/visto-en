import { loadRunMedia, attachRunMedia } from "../media/run.js";
import { completeWithLlm } from "./llm.js";
import { templateEnrich } from "./template.js";

function blocksLlm(error) {
  return /falta META_MODEL_API_KEY|LLM_PROVIDER no está/.test(error.message);
}

export async function enrichPost(post, cfg, fetchImpl = fetch) {
  const media = loadRunMedia(post, cfg);
  const ready = {
    ...post,
    transcript: media.transcript?.text || "",
    transcriptModel: media.transcript?.model || "",
  };
  let enriched;
  if (cfg.llmProvider === "meta" || cfg.llmProvider === "ollama") {
    try {
      enriched = await completeWithLlm(ready, cfg, fetchImpl);
    } catch (error) {
      if (blocksLlm(error)) throw error;
      enriched = templateEnrich(ready);
      enriched.llmError = error.message;
    }
  } else {
    enriched = templateEnrich(ready);
  }
  return attachRunMedia(enriched, media);
}
