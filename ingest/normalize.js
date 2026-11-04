const USERNAME = /^(?!.*\.\.)(?!\.)[A-Za-z0-9._]{2,30}(?<!\.)$/;
const POST_ID = /^\d+$/;

const PAID_HASHTAG = /(?:^|[\s(])#(?:publi|ad|publicidad|colaboracion|colaboración)(?=$|[\s)#.,:;!?])/iu;
const PAID_PHRASE = /paid\s+partnership/i;

export function captionMarksPaid(caption) {
  return PAID_HASHTAG.test(String(caption)) || PAID_PHRASE.test(String(caption));
}

export function partnershipAdsMarksPaid(raw) {
  const record = raw && (raw.partnership_ads ?? raw.partnership_ad);
  if (record === true) return true;
  if (!record || typeof record !== "object") return false;
  return record.paid === true || record.is_paid === true;
}

export function cleanDisplayName(value, fallback) {
  const clean = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return clean || fallback;
}

export function normalizePermalink(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:" || url.hostname !== "www.instagram.com") {
    throw new Error("Permalink inválido");
  }
  return url.href;
}

export function normalizeMedia(raw, source, displayName) {
  if (!raw || typeof raw !== "object") return null;
  const caption = raw.caption == null ? "" : String(raw.caption).trim();
  if (!caption) return null;
  if (!raw.id || !raw.permalink) throw new Error(`Media incompleta en ${source}`);
  const id = String(raw.id);
  if (!POST_ID.test(id)) throw new Error(`Id de post inválido en ${source}`);
  const username = String(raw.username || "").replace(/^@/, "");
  if (!USERNAME.test(username)) throw new Error(`Usuario inválido en ${source}: ${username || "(vacío)"}`);
  let permalink;
  try {
    permalink = normalizePermalink(raw.permalink);
  } catch {
    throw new Error(`Permalink inválido en ${source}`);
  }
  const mediaType = raw.media_type || "IMAGE";
  return {
    id,
    username,
    displayName: cleanDisplayName(displayName || raw.display_name || raw.name, username),
    caption,
    mediaType,
    mediaProductType: raw.media_product_type || (mediaType === "VIDEO" ? "REELS" : "FEED"),
    permalink,
    publishedAt: String(raw.timestamp || ""),
    likeCount: Number(raw.like_count || 0),
    commentsCount: Number(raw.comments_count || 0),
    isPaid: captionMarksPaid(caption) || partnershipAdsMarksPaid(raw),
    consentStatus: raw.consent_status === "approved" ? "approved" : "pending",
    source,
    imagePrompt: optionalText(raw.image_prompt, "image_prompt"),
    imageAlt: optionalText(raw.image_alt, "image_alt"),
    audioPath: optionalAudio(raw.audio_path),
    audioLanguage: optionalText(raw.audio_language, "audio_language"),
  };
}

function optionalText(value, label) {
  if (value == null || value === "") return "";
  const text = String(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > 800) throw new Error(`${label} demasiado largo`);
  return text;
}

function optionalAudio(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim().replaceAll("\\", "/");
  if (text.startsWith("/") || text.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("audio_path inválido");
  }
  if (!/^[\w./-]+$/i.test(text) || !/\.(wav|m4a)$/i.test(text)) {
    throw new Error("audio_path inválido");
  }
  return text;
}

export function dedupePosts(posts) {
  const seen = Object.create(null);
  const unique = [];
  for (const post of posts) {
    if (!post || seen[post.id]) continue;
    seen[post.id] = true;
    unique.push(post);
  }
  return unique.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function mediaNoun(post) {
  if (post.mediaProductType === "REELS" || post.mediaType === "VIDEO") return "un reel";
  if (post.mediaType === "CAROUSEL_ALBUM") return "un carrusel";
  return "una foto";
}

export function mediaLabel(post) {
  if (post.mediaProductType === "REELS" || post.mediaType === "VIDEO") return "Reel";
  if (post.mediaType === "CAROUSEL_ALBUM") return "Carrusel";
  return "Foto";
}

export function isVideoPost(post) {
  return post.mediaProductType === "REELS" || post.mediaType === "VIDEO";
}

export function sourceLabel(source) {
  if (source === "tags") return "Etiqueta en la cuenta de la tienda";
  if (source === "mentioned_media") return "Mención en el caption";
  if (source === "business_discovery") return "Medio público de una cuenta profesional";
  return source;
}
