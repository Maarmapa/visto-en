import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { requireMetaKey } from "../lib/config.js";
import { insideDir } from "./paths.js";

export function resolveAudioPath(post, cfg) {
  if (!post.audioPath) return "";
  const abs = resolve(cfg.fixturesDir, post.audioPath);
  if (!insideDir(cfg.mediaDir, abs)) throw new Error("audio_path inválido");
  if (!/\.(wav|m4a)$/i.test(abs)) throw new Error("audio_path inválido");
  return abs;
}

export function transcriptPathFor(audioAbs) {
  const parsed = parse(audioAbs);
  return join(parsed.dir, `${parsed.name}-transcript.json`);
}

export function readTranscript(post, cfg) {
  const audioAbs = resolveAudioPath(post, cfg);
  if (!audioAbs) return null;
  const file = transcriptPathFor(audioAbs);
  if (!insideDir(cfg.mediaDir, file) || !existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("el JSON de la transcripción no es válido");
  }
  if (!data || data.post_id !== post.id || data.audio_path !== post.audioPath) return null;
  const text = typeof data.transcript === "string" ? data.transcript.trim() : "";
  const model = typeof data.model === "string" ? data.model.trim() : "";
  if (!text || !model) return null;
  return { text, model, file, created: String(data.created || ""), endpoint: String(data.endpoint || "") };
}

export function buildMultipart({ requestJson, filename, bytes }) {
  const boundary = `----visto${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${requestJson}\r\n`
    + `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function transcribeRequest(post, cfg) {
  const request = {
    mode: "PUSH_TO_TALK",
    model: cfg.metaTranscribeModel || "muse-voice-transcribe-1.0",
    audioEncoding: "WAV",
  };
  if (post.audioLanguage) request.languageBias = [post.audioLanguage];
  return request;
}

export function transcriptFromPayload(payload) {
  if (typeof payload?.transcript === "string" && payload.transcript.trim()) return payload.transcript.trim();
  const turns = Array.isArray(payload?.turns)
    ? payload.turns.map((turn) => (typeof turn?.transcript === "string" ? turn.transcript.trim() : "")).filter(Boolean)
    : [];
  if (!turns.length) throw new Error("la respuesta no trae transcript");
  return turns.join(" ");
}

export function convertToWav(audioAbs) {
  const parsed = parse(audioAbs);
  const dest = join(tmpdir(), `visto-${process.pid}-${parsed.name}.wav`);
  const result = spawnSync("ffmpeg", [
    "-y",
    "-i",
    audioAbs,
    "-ac",
    "1",
    "-ar",
    "24000",
    "-c:a",
    "pcm_s16le",
    "-map_metadata",
    "-1",
    dest,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  if (result.error || result.status !== 0) {
    throw new Error("ffmpeg no pudo convertir el audio a wav PCM mono de 24 kHz");
  }
  return dest;
}

function wavBytesFor(audioAbs, convertImpl) {
  if (/\.wav$/i.test(audioAbs)) return { bytes: readFileSync(audioAbs), cleanup: "" };
  const convert = convertImpl || convertToWav;
  const produced = convert(audioAbs);
  if (Buffer.isBuffer(produced)) return { bytes: produced, cleanup: "" };
  return { bytes: readFileSync(produced), cleanup: produced };
}

export async function transcribeMissing(posts, cfg, fetchImpl = fetch, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const jobs = posts.filter((post) => post.audioPath);
  const created = [];
  const skipped = [];
  const pending = [];
  for (const post of jobs) {
    const audioAbs = resolveAudioPath(post, cfg);
    if (!existsSync(audioAbs)) throw new Error(`no está el audio ${post.audioPath}`);
    if (readTranscript(post, cfg)) skipped.push(post.id);
    else pending.push({ post, audioAbs });
  }
  if (!pending.length) return { created, skipped };
  requireMetaKey(cfg);
  for (const { post, audioAbs } of pending) {
    const wav = wavBytesFor(audioAbs, options.convertImpl);
    try {
      const request = transcribeRequest(post, cfg);
      const filename = `${parse(audioAbs).name}.wav`;
      const form = buildMultipart({
        requestJson: JSON.stringify(request),
        filename,
        bytes: wav.bytes,
      });
      const response = await fetchImpl(cfg.metaTranscribeEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.metaModelApiKey}`,
          Accept: "application/json",
          "Content-Type": form.contentType,
        },
        body: form.body,
      });
      if (!response.ok) throw new Error(`La transcripción respondió ${response.status}`);
      const transcript = transcriptFromPayload(await response.json());
      const record = {
        post_id: post.id,
        audio_path: post.audioPath,
        model: request.model,
        transcript,
        created: now(),
        endpoint: cfg.metaTranscribeEndpoint,
      };
      const dest = transcriptPathFor(audioAbs);
      mkdirSync(parse(dest).dir, { recursive: true });
      const tmp = `${dest}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
      renameSync(tmp, dest);
      created.push(post.id);
    } finally {
      if (wav.cleanup) rmSync(wav.cleanup, { force: true });
    }
  }
  return { created, skipped };
}
