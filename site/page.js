import { isVideoPost } from "../ingest/normalize.js";
import { buildJsonLd, pageTitle } from "./jsonld.js";

export function postSlug(permalink, id) {
  let last = "";
  try {
    const parts = new URL(permalink).pathname.split("/").filter(Boolean);
    last = parts.at(-1) || "";
  } catch {
    last = "";
  }
  const slug = (last || id).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!slug) throw new Error(`Slug vacío para ${id}`);
  return slug;
}

export function buildPage(post, enriched, cfg) {
  const slug = postSlug(post.permalink, post.id);
  const path = `/visto-en/${post.username}/${slug}/`;
  return {
    post,
    enriched,
    slug,
    path,
    file: `visto-en/${post.username}/${slug}/index.html`,
    url: `${cfg.siteBaseUrl}${path}`,
    title: pageTitle(post, enriched),
    jsonld: buildJsonLd(post, enriched, `${cfg.siteBaseUrl}${path}`, cfg),
    video: isVideoPost(post),
  };
}
