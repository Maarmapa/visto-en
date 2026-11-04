import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireMetaKey } from "../lib/config.js";
import { insideDir, safeBasename } from "./paths.js";

const FORMAT_EXT = { png: "png", webp: "webp", jpeg: "jpg", jpg: "jpg" };

export function extensionForFormat(format) {
  return FORMAT_EXT[String(format || "").toLowerCase()] || "";
}

function sniffFormat(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "";
}

export function imageRequestBody(prompt, cfg) {
  return {
    model: cfg.metaImageModel || "muse-image-1.0",
    prompt,
    n: 1,
    response_format: "b64_json",
    output_format: "png",
    size: "1024x1280",
    tool_enablement: {
      enable_image_search: false,
      enable_web_search: false,
      enable_shell: false,
    },
  };
}

export function readManifest(mediaDir) {
  const file = join(mediaDir, "manifest.json");
  if (!existsSync(file)) return { images: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("fixtures/media/manifest.json no es JSON válido");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.images)) {
    throw new Error("fixtures/media/manifest.json no trae images");
  }
  return data;
}

export function writeManifest(mediaDir, manifest) {
  mkdirSync(mediaDir, { recursive: true });
  const images = [...(manifest.images || [])].sort((a, b) => String(a.post_id).localeCompare(String(b.post_id)));
  const payload = { updated: manifest.updated, images };
  const file = join(mediaDir, "manifest.json");
  const tmp = join(mediaDir, `.manifest.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tmp, file);
}

function mediaFile(mediaDir, name) {
  const file = safeBasename(name);
  if (!file) return "";
  const abs = join(mediaDir, file);
  if (!insideDir(mediaDir, abs)) return "";
  return abs;
}

export function manifestEntryFor(post, cfg) {
  const manifest = readManifest(cfg.mediaDir);
  const entry = (manifest.images || []).find((item) => item && String(item.post_id) === post.id);
  if (!entry) return null;
  const abs = mediaFile(cfg.mediaDir, entry.file);
  if (!abs || !existsSync(abs)) return null;
  return { entry, abs, file: safeBasename(entry.file) };
}

export function findImageForPost(post, cfg) {
  const found = manifestEntryFor(post, cfg);
  if (found) {
    return {
      file: found.file,
      absPath: found.abs,
      model: String(found.entry.model || ""),
      alt: String(found.entry.alt || post.imageAlt || post.imagePrompt || "Imagen sintética del post para la demo"),
      prompt: String(found.entry.prompt || post.imagePrompt || ""),
    };
  }
  for (const ext of ["png", "webp", "jpg", "jpeg"]) {
    const file = `${post.id}.${ext}`;
    const abs = mediaFile(cfg.mediaDir, file);
    if (abs && existsSync(abs)) {
      return {
        file,
        absPath: abs,
        model: "",
        alt: post.imageAlt || post.imagePrompt || "Imagen sintética del post para la demo",
        prompt: post.imagePrompt || "",
      };
    }
  }
  return null;
}

async function bytesFromPayload(payload, fetchImpl) {
  const item = payload?.data?.[0];
  if (!item || typeof item !== "object") throw new Error("la respuesta no trae imagen");
  const declared = extensionForFormat(payload.output_format) || "png";
  if (typeof item.b64_json === "string" && item.b64_json) {
    const bytes = Buffer.from(item.b64_json, "base64");
    if (!bytes.length) throw new Error("la respuesta no trae imagen");
    return { bytes, format: sniffFormat(bytes) || declared };
  }
  if (typeof item.url === "string" && item.url) {
    const response = await fetchImpl(item.url);
    if (!response.ok) throw new Error(`La imagen respondió ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("la respuesta no trae imagen");
    return { bytes, format: sniffFormat(bytes) || declared };
  }
  throw new Error("la respuesta no trae imagen");
}

export async function generateMissingImages(posts, cfg, fetchImpl = fetch, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const jobs = posts.filter((post) => post.imagePrompt);
  const created = [];
  const skipped = [];
  const pending = [];
  for (const post of jobs) {
    if (manifestEntryFor(post, cfg)) skipped.push(post.id);
    else pending.push(post);
  }
  if (!pending.length) return { created, skipped };
  requireMetaKey(cfg);
  mkdirSync(cfg.mediaDir, { recursive: true });
  for (const post of pending) {
    if (!/^\d+$/.test(post.id)) throw new Error("id de post inválido");
    const body = imageRequestBody(post.imagePrompt, cfg);
    const response = await fetchImpl(cfg.metaImageEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.metaModelApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`La imagen respondió ${response.status}`);
    const decoded = await bytesFromPayload(await response.json(), fetchImpl);
    const file = `${post.id}.${decoded.format}`;
    const abs = join(cfg.mediaDir, file);
    const tmp = join(cfg.mediaDir, `.${file}.${process.pid}.tmp`);
    writeFileSync(tmp, decoded.bytes);
    renameSync(tmp, abs);
    const manifest = readManifest(cfg.mediaDir);
    const record = {
      post_id: post.id,
      file,
      model: body.model,
      prompt: post.imagePrompt,
      alt: post.imageAlt || post.imagePrompt,
      created: now(),
      endpoint: cfg.metaImageEndpoint,
    };
    manifest.images = (manifest.images || []).filter((item) => String(item.post_id) !== post.id);
    manifest.images.push(record);
    manifest.updated = record.created;
    writeManifest(cfg.mediaDir, manifest);
    created.push(post.id);
  }
  return { created, skipped };
}
