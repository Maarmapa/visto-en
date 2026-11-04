import { findImageForPost } from "./images.js";
import { readTranscript } from "./transcribe.js";

const ROLE_ORDER = { texto: 0, imagen: 1, audio: 2 };

export function loadRunMedia(post, cfg) {
  return {
    image: findImageForPost(post, cfg),
    transcript: readTranscript(post, cfg),
  };
}

export function attachRunMedia(enriched, media) {
  const models = Array.isArray(enriched.metaModels) ? [...enriched.metaModels] : [];
  if (media.image?.model && !models.some((item) => item.role === "imagen")) {
    models.push({ role: "imagen", model: media.image.model });
  }
  models.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  return {
    ...enriched,
    metaModels: models,
    image: media.image || null,
  };
}

export function metaModelsLine(enriched) {
  const models = Array.isArray(enriched?.metaModels)
    ? enriched.metaModels.filter((item) => item?.model && item?.role)
    : [];
  if (!models.length) return "Ningún modelo de Meta tocó esta ficha.";
  return `Modelos de Meta en esta ficha: ${models.map((item) => `${item.model} (${item.role})`).join(", ")}.`;
}

export function syntheticImageLabel(model) {
  return `Imagen sintética generada con ${model} para la demo`;
}