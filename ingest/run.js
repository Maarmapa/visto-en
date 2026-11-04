import { postsFromFixtures } from "./fixtures.js";
import {
  fetchBusinessDiscovery,
  fetchMentionedMedia,
  fetchTags,
  listDiscoveryUsernames,
  listMentionedIds,
} from "./graph.js";
import { dedupePosts } from "./normalize.js";

export async function ingest(cfg, fetchImpl = fetch) {
  if (cfg.ingestMock) return postsFromFixtures(cfg.fixturesDir);

  const posts = await fetchTags(cfg, fetchImpl);
  for (const mediaId of listMentionedIds(cfg)) {
    const media = await fetchMentionedMedia(cfg, mediaId, fetchImpl);
    if (media) posts.push(media);
  }
  for (const username of listDiscoveryUsernames(cfg)) {
    const found = await fetchBusinessDiscovery(cfg, username, fetchImpl);
    posts.push(...found);
  }
  return dedupePosts(posts);
}
