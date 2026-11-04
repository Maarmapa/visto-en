import { homedir } from "node:os";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const META_CHAT_COMPLETIONS_URL = "https://api.meta.ai/v1/chat/completions";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
// POST /v1/images/generations, confirmado en
// https://dev.meta.ai/docs/api-reference/images/create-image
export const META_IMAGE_GENERATIONS_URL = "https://api.meta.ai/v1/images/generations";
export const DEFAULT_META_IMAGE_MODEL = "muse-image-1.0";
// POST /v1/asr/transcribe (multipart), confirmado en
// https://dev.meta.ai/docs/speech-to-text
// No es el endpoint de OpenAI /audio/transcriptions.
export const META_ASR_TRANSCRIBE_URL = "https://api.meta.ai/v1/asr/transcribe";
export const DEFAULT_META_TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

export function requireMetaKey(cfg) {
  if (!cfg.metaModelApiKey) throw new Error("falta META_MODEL_API_KEY");
}

function cleanBase(value) {
  const raw = value && String(value).trim() ? String(value).trim() : "https://tienda-demo.example";
  return raw.replace(/\/+$/, "");
}

function present(value) {
  return value !== undefined && value !== "";
}

function pickDir(env, primary, legacy, fallback) {
  if (present(env[primary])) return resolve(env[primary]);
  if (present(env[legacy])) return resolve(env[legacy]);
  return fallback;
}

export function loadConfig(env = process.env) {
  const mock = present(env.MOCK) ? env.MOCK !== "0" : true;
  const ingestMock = present(env.INGEST_MOCK) ? env.INGEST_MOCK !== "0" : mock;
  const llmProvider = present(env.LLM_PROVIDER) ? String(env.LLM_PROVIDER) : "template";
  const fixturesDir = env.FIXTURES_DIR ? resolve(env.FIXTURES_DIR) : join(ROOT, "fixtures");
  return {
    mock,
    ingestMock,
    root: ROOT,
    outDir: pickDir(env, "VISTO_OUT_DIR", "OUT_DIR", join(ROOT, "out")),
    dataDir: pickDir(env, "VISTO_DATA_DIR", "DATA_DIR", join(ROOT, "data")),
    fixturesDir,
    promptsPath: env.PROMPTS_PATH ? resolve(env.PROMPTS_PATH) : join(ROOT, "fixtures", "prompts.yaml"),
    siteBaseUrl: cleanBase(env.SITE_BASE_URL),
    port: Number(env.PORT || 4321),
    brandName: "Tienda Demo",
    brandHandle: "tiendademo",
    graphApiVersion: env.GRAPH_API_VERSION || "v25.0",
    metaAppId: env.META_APP_ID || "",
    igUserId: env.IG_USER_ID || "",
    metaAccessToken: env.META_ACCESS_TOKEN || "",
    mentionedMediaIds: env.MENTIONED_MEDIA_IDS || "",
    discoveryUsernames: env.DISCOVERY_USERNAMES || "",
    llmProvider,
    mediaDir: env.MEDIA_DIR ? resolve(env.MEDIA_DIR) : join(fixturesDir, "media"),
    metaModelApiUrl: env.META_MODEL_API_URL || META_CHAT_COMPLETIONS_URL,
    metaModelApiKey: env.META_MODEL_API_KEY || "",
    metaModelName: env.META_MODEL_NAME || DEFAULT_META_MODEL,
    metaImageEndpoint: env.META_IMAGE_ENDPOINT || META_IMAGE_GENERATIONS_URL,
    metaImageModel: env.META_IMAGE_MODEL || DEFAULT_META_IMAGE_MODEL,
    metaTranscribeEndpoint: env.META_TRANSCRIBE_ENDPOINT || META_ASR_TRANSCRIBE_URL,
    metaTranscribeModel: env.META_TRANSCRIBE_MODEL || DEFAULT_META_TRANSCRIBE_MODEL,
    ollamaUrl: env.OLLAMA_URL || "",
    ollamaModel: env.OLLAMA_MODEL || "",
    measureLive: env.MEASURE_LIVE === "1",
    perplexityApiKey: env.PERPLEXITY_API_KEY || "",
    perplexityModel: env.PERPLEXITY_MODEL || "",
    openaiApiKey: env.OPENAI_API_KEY || "",
    openaiModel: env.OPENAI_MODEL || "",
    whatsappToken: env.WHATSAPP_TOKEN || "",
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    whatsappBusinessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    whatsappTemplateName: env.WHATSAPP_TEMPLATE_NAME || "visto_en_aprobacion",
    indexNowKey: env.INDEXNOW_KEY || "",
  };
}

export function assertWritableDir(dir) {
  const abs = resolve(dir);
  const home = resolve(homedir());
  const root = resolve(ROOT);
  if (abs === resolve(sep) || abs === home || abs === resolve(".") || abs === root) {
    throw new Error(`Directorio rechazado: ${dir}`);
  }
  return abs;
}

export function isInsideRepo(dir) {
  const abs = resolve(dir);
  const root = resolve(ROOT);
  return abs === root || abs.startsWith(root + sep);
}
