import { normalizeMedia } from "./normalize.js";

const SAFE_USERNAME = /^[A-Za-z0-9._]+$/;
const SAFE_MEDIA_ID = /^\d+$/;

function assertLive(cfg) {
  if (cfg.ingestMock) throw new Error("Graph API no se llama en modo mock");
}

export async function graphGet(cfg, path, params, fetchImpl = fetch) {
  assertLive(cfg);
  if (!cfg.metaAccessToken) throw new Error("falta META_ACCESS_TOKEN");
  if (!cfg.igUserId) throw new Error("falta IG_USER_ID");
  const url = new URL(`https://graph.facebook.com/${cfg.graphApiVersion}/${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (key.toLowerCase() === "access_token") {
      throw new Error("El token va en el header Authorization, no en la URL");
    }
    url.searchParams.set(key, String(value));
  }
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${cfg.metaAccessToken}` },
  });
  if (!response.ok) throw new Error(`Graph API respondió ${response.status}`);
  return response.json();
}

export async function fetchTags(cfg, fetchImpl = fetch) {
  const body = await graphGet(cfg, `${cfg.igUserId}/tags`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,username,like_count,comments_count",
  }, fetchImpl);
  return (body.data || []).map((media) => normalizeMedia(media, "tags")).filter(Boolean);
}

export async function fetchMentionedMedia(cfg, mediaId, fetchImpl = fetch) {
  if (!SAFE_MEDIA_ID.test(String(mediaId))) throw new Error("media id inválido");
  const fields = `mentioned_media.media_id(${mediaId}){id,caption,media_type,media_product_type,permalink,timestamp,username,like_count,comments_count}`;
  const body = await graphGet(cfg, cfg.igUserId, { fields }, fetchImpl);
  if (!body.mentioned_media) return null;
  return normalizeMedia(body.mentioned_media, "mentioned_media");
}

export async function fetchBusinessDiscovery(cfg, username, fetchImpl = fetch) {
  if (!SAFE_USERNAME.test(String(username))) throw new Error("usuario de discovery inválido");
  const fields = `business_discovery.username(${username}){username,name,media{id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;
  const body = await graphGet(cfg, cfg.igUserId, { fields }, fetchImpl);
  const account = body.business_discovery;
  if (!account) return [];
  return (account.media?.data || []).map((media) => normalizeMedia({
    ...media,
    username: media.username || account.username,
  }, "business_discovery", account.name)).filter(Boolean);
}

export function oembedRequestUrl(permalink, version = "v25.0") {
  const url = new URL(`https://graph.facebook.com/${version}/instagram_oembed`);
  url.searchParams.set("url", permalink);
  url.searchParams.set("omitscript", "true");
  return url;
}

export async function fetchOembedHtml(permalink, cfg, fetchImpl = fetch) {
  if (cfg.ingestMock) throw new Error("oEmbed no se llama en modo mock");
  const response = await fetchImpl(oembedRequestUrl(permalink, cfg.graphApiVersion));
  if (!response.ok) throw new Error(`oEmbed respondió ${response.status}`);
  const body = await response.json();
  return body.html || "";
}

export function listMentionedIds(cfg) {
  return String(cfg.mentionedMediaIds || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function listDiscoveryUsernames(cfg) {
  return String(cfg.discoveryUsernames || "").split(",").map((item) => item.trim()).filter(Boolean);
}
