import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dedupePosts, normalizeMedia } from "./normalize.js";

function readJson(dir, name) {
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}

export function postsFromFixtures(dir) {
  const tags = readJson(dir, "tags.json");
  const mentioned = readJson(dir, "mentioned_media.json");
  const discovery = readJson(dir, "business_discovery.json");
  const posts = [];

  for (const media of tags.data || []) {
    const post = normalizeMedia(media, "tags", media.display_name);
    if (post) posts.push(post);
  }
  for (const entry of mentioned.data || []) {
    const media = entry.mentioned_media || entry;
    const post = normalizeMedia(media, "mentioned_media", media.display_name);
    if (post) posts.push(post);
  }
  for (const account of discovery.data || []) {
    for (const media of account.media?.data || []) {
      const post = normalizeMedia(
        { ...media, username: media.username || account.username },
        "business_discovery",
        account.name,
      );
      if (post) posts.push(post);
    }
  }

  const unique = dedupePosts(posts);
  if (unique.length < 5 || unique.length > 8) {
    throw new Error(`El mock espera entre 5 y 8 posts y leyó ${unique.length}`);
  }
  return unique;
}
