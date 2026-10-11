// ─── Puter.js integration, model catalog & smart capability checks ───

export interface ModelCaps {
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  webSearch: boolean;
  imageGen: boolean; // via chat (gemini image)
  videoUnderstand: boolean;
  fileSupport: boolean;
  thinkingExtended: boolean; // claude thinking object
  verbosity: boolean; // openai only
  reasoningEffort: boolean; // openai + muse spark
  temperature: boolean;
  imageConfig: boolean; // gemini image_config
  compaction: boolean;
  outputJSON: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  vendor: string;
  family: string;
  tagline: string;
  context: number;
  maxOut: number;
  speed: 1 | 2 | 3 | 4 | 5;
  quality: 1 | 2 | 3 | 4 | 5;
  cost: 1 | 2 | 3 | 4 | 5;
  caps: ModelCaps;
  color: string;
}

const O = (p: Partial<ModelCaps>): ModelCaps => ({
  vision: true, reasoning: false, tools: true, webSearch: false,
  imageGen: false, videoUnderstand: false, fileSupport: true,
  thinkingExtended: false, verbosity: false, reasoningEffort: false,
  temperature: true, imageConfig: false, compaction: true, outputJSON: true,
  ...p,
});

export const MODEL_CATALOG: AIModel[] = [
  { id: "gpt-6-astra", name: "GPT-6 Astra", vendor: "openai", family: "OpenAI flagship", tagline: "Frontier reasoning · best quality", context: 400000, maxOut: 128000, speed: 2, quality: 5, cost: 5, color: "#10a37f", caps: O({ reasoning: true, webSearch: true, verbosity: true, reasoningEffort: true, temperature: false, videoUnderstand: true }) },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra", vendor: "openai", family: "OpenAI flagship", tagline: "Frontier reasoning · best quality", context: 400000, maxOut: 128000, speed: 2, quality: 5, cost: 5, color: "#10a37f", caps: O({ reasoning: true, webSearch: true, verbosity: true, reasoningEffort: true, temperature: false, videoUnderstand: true }) },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", vendor: "openai", family: "OpenAI balanced", tagline: "Great quality / speed balance", context: 400000, maxOut: 64000, speed: 3, quality: 4, cost: 4, color: "#19c37d", caps: O({ reasoning: true, webSearch: true, verbosity: true, reasoningEffort: true, temperature: false, videoUnderstand: true }) },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", vendor: "openai", family: "OpenAI fast", tagline: "Fast, cheap, web-search ready", context: 400000, maxOut: 32000, speed: 5, quality: 3, cost: 1, color: "#7dd3a8", caps: O({ reasoning: false, webSearch: true, verbosity: true, reasoningEffort: true, videoUnderstand: true }) },
  { id: "openai/gpt-5.5", name: "GPT-5.5", vendor: "openai", family: "OpenAI", tagline: "Reliable all-rounder", context: 400000, maxOut: 32000, speed: 4, quality: 4, cost: 3, color: "#10a37f", caps: O({ reasoning: true, webSearch: true, verbosity: true, reasoningEffort: true, videoUnderstand: true }) },
  { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", vendor: "openai", family: "OpenAI tiny", tagline: "Default · instant answers", context: 128000, maxOut: 16000, speed: 5, quality: 3, cost: 1, color: "#93c5a5", caps: O({ webSearch: true, verbosity: true, reasoningEffort: true, videoUnderstand: true }) },
  { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex", vendor: "openai", family: "Code specialist", tagline: "Elite coding & agents", context: 400000, maxOut: 128000, speed: 3, quality: 5, cost: 4, color: "#0ea5e9", caps: O({ reasoning: true, verbosity: true, reasoningEffort: true, temperature: false, videoUnderstand: false }) },
  { id: "x-ai/grok-4.7", name: "Grok 4.7", vendor: "xai", family: "xAI flagship", tagline: "Witty · real-time reasoning", context: 2000000, maxOut: 64000, speed: 3, quality: 5, cost: 4, color: "#e5e5e5", caps: O({ reasoning: true, videoUnderstand: true }) },
  { id: "x-ai/grok-build-0.1", name: "Grok Build 0.1", vendor: "xai", family: "xAI code", tagline: "Code generation tuned", context: 256000, maxOut: 32000, speed: 4, quality: 4, cost: 3, color: "#d4d4d8", caps: O({ reasoning: false, videoUnderstand: false }) },
  { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", vendor: "anthropic", family: "Anthropic flagship", tagline: "Best writing & long context", context: 1000000, maxOut: 128000, speed: 2, quality: 5, cost: 5, color: "#d97757", caps: O({ reasoning: true, thinkingExtended: true, compaction: true, videoUnderstand: true }) },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", vendor: "anthropic", family: "Anthropic", tagline: "Deep reasoning", context: 200000, maxOut: 64000, speed: 2, quality: 5, cost: 5, color: "#d97757", caps: O({ reasoning: true, thinkingExtended: true }) },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", vendor: "anthropic", family: "Anthropic balanced", tagline: "Smart & efficient", context: 1000000, maxOut: 64000, speed: 4, quality: 4, cost: 3, color: "#e8956d", caps: O({ reasoning: true, thinkingExtended: true, videoUnderstand: true }) },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", vendor: "anthropic", family: "Anthropic", tagline: "Cache-friendly support agent", context: 200000, maxOut: 32000, speed: 4, quality: 4, cost: 3, color: "#e8956d", caps: O({ reasoning: false, thinkingExtended: true }) },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", vendor: "google", family: "Google multimodal", tagline: "Fast multimodal", context: 1000000, maxOut: 64000, speed: 5, quality: 4, cost: 2, color: "#4e8cff", caps: O({ reasoning: true, videoUnderstand: true }) },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", vendor: "google", family: "Google pro", tagline: "Complex reasoning", context: 2000000, maxOut: 64000, speed: 3, quality: 5, cost: 4, color: "#7aa2ff", caps: O({ reasoning: true, videoUnderstand: true }) },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", vendor: "google", family: "Google lite", tagline: "Ultra-cheap streaming", context: 1000000, maxOut: 32000, speed: 5, quality: 3, cost: 1, color: "#93b4ff", caps: O({ reasoning: false, videoUnderstand: true }) },
  { id: "gemini-3.1-flash-image-preview", name: "Gemini Image 3.1", vendor: "google", family: "Image generation", tagline: "Draw & edit images in chat", context: 1000000, maxOut: 32000, speed: 3, quality: 4, cost: 3, color: "#c084fc", caps: O({ reasoning: false, imageGen: true, imageConfig: true, tools: false, webSearch: false }) },
  { id: "google/gemma-4-31b-it", name: "Gemma 4 31B", vendor: "google", family: "Open weights", tagline: "Lightweight haiku-class", context: 128000, maxOut: 16000, speed: 5, quality: 3, cost: 1, color: "#86c5ff", caps: O({ reasoning: false, tools: true }) },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", vendor: "deepseek", family: "Open reasoning", tagline: "Math · code · technical", context: 256000, maxOut: 64000, speed: 3, quality: 5, cost: 2, color: "#7c8aff", caps: O({ reasoning: true }) },
  { id: "qwen/qwen3.8-max", name: "Qwen 3.8 Max", vendor: "alibaba", family: "Multilingual", tagline: "Strong ZH-EN + 100 langs", context: 256000, maxOut: 32000, speed: 4, quality: 4, cost: 2, color: "#a78bfa", caps: O({ reasoning: true }) },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", vendor: "meta", family: "Open weights", tagline: "Generalist open model", context: 1000000, maxOut: 32000, speed: 4, quality: 4, cost: 1, color: "#60a5fa", caps: O({ reasoning: false }) },
  { id: "z-ai/glm-5.3", name: "GLM 5.3", vendor: "z-ai", family: "Agentic", tagline: "Long-horizon agents & code", context: 512000, maxOut: 64000, speed: 3, quality: 4, cost: 2, color: "#34d399", caps: O({ reasoning: true }) },
  { id: "reka/reka-edge", name: "Reka Edge", vendor: "reka", family: "Video understanding", tagline: "Natively watches video", context: 128000, maxOut: 16000, speed: 4, quality: 3, cost: 2, color: "#fbbf24", caps: O({ reasoning: false, videoUnderstand: true }) },
  { id: "essentialai/rnj-1-instruct", name: "RNJ-1 Instruct", vendor: "essentialai", family: "Efficient", tagline: "Fast instruction following", context: 128000, maxOut: 16000, speed: 5, quality: 3, cost: 1, color: "#94a3b8", caps: O({ reasoning: false }) },
  { id: "mistral/mistral-large", name: "Mistral Large", vendor: "mistral", family: "European", tagline: "Precise EU-hosted", context: 256000, maxOut: 32000, speed: 4, quality: 4, cost: 3, color: "#fb923c", caps: O({ reasoning: true }) },
];

export const IMAGE_MODELS = [
  { id: "gpt-image-2", provider: "openai", name: "GPT Image 2", desc: "OpenAI · crisp edits", qualities: ["low", "medium", "high", "auto"] },
  { id: "gpt-image-2.5-flare", provider: "openai", name: "GPT Image 2.5 Flare", desc: "OpenAI · vivid", qualities: ["low", "medium", "high", "xhigh", "max", "auto"] },
  { id: "gpt-image-2.5-sunburst", provider: "openai", name: "GPT Image 2.5 Sunburst", desc: "OpenAI · photoreal", qualities: ["low", "medium", "high", "xhigh", "max", "auto"] },
  { id: "gemini-3.1-flash-image", provider: "gemini", name: "Gemini 3.1 Flash Image", desc: "Google · fast + edits", qualities: ["512", "1K", "2K", "4K"] },
  { id: "gemini-3-pro-image", provider: "gemini", name: "Gemini 3 Pro Image", desc: "Google · highest fidelity", qualities: ["1K", "2K", "4K"] },
  { id: "grok-imagine-image-2.0", provider: "xai", name: "Grok Imagine 2.0", desc: "xAI · stylized", qualities: ["low", "medium", "auto"] },
  { id: "grok-imagine-image", provider: "xai", name: "Grok Imagine", desc: "xAI · classic", qualities: ["1k", "2k"] },
  { id: "seedream-5-0-lite-260128", provider: "byteplus", name: "Seedream 5 Lite", desc: "BytePlus · aesthetic", qualities: ["standard"] },
  { id: "@cf/black-forest-labs/flux-1-schnell", provider: "cloudflare", name: "FLUX.1 Schnell", desc: "Cloudflare · 1024px instant", qualities: ["standard"] },
];

export const VIDEO_MODELS = [
  { id: "wan2.7-t2v", name: "Wan 2.7 T2V", desc: "Default · 2–15s · 720P/1080P · audio", seconds: [2, 4, 5, 8, 10, 15], sizes: ["720P", "1080P"] },
  { id: "wan-ai/wan2.7-i2v", name: "Wan 2.7 I2V", desc: "Image-to-video · needs first frame", seconds: [2, 4, 5, 8, 10, 15], sizes: ["720P", "1080P"] },
  { id: "seedance-2-0-mini", name: "Seedance 2.0 Mini", desc: "Fast · 4–15s · audio", seconds: [4, 5, 8, 10, 15], sizes: ["480p", "720p"] },
  { id: "byteplus/dreamina-seedance-2-0-260128", name: "Seedance 2.0", desc: "Cinematic · up to 4K · audio", seconds: [4, 5, 8, 12, 15], sizes: ["480p", "720p", "1080p", "4k"] },
  { id: "bytedance/seedance-2.5", name: "Seedance 2.5", desc: "Long-form · 4–30s · always audio", seconds: [4, 5, 8, 15, 30], sizes: ["480p", "720p"] },
  { id: "togetherai:google/veo-3.1", name: "Veo 3.1", desc: "Google · 4/6/8s · soundtrack", seconds: [4, 6, 8], sizes: ["provider default"] },
  { id: "togetherai:google/veo-3.1-lite", name: "Veo 3.1 Lite", desc: "Google · lighter · fast", seconds: [4, 6, 8], sizes: ["provider default"] },
  { id: "bytedance/seedance-1.0-lite", name: "Seedance 1.0 Lite", desc: "Cheap per-clip · 5s fixed", seconds: [5], sizes: ["864x480", "1280x720", "960x960"] },
];

export const TTS_PRESETS = [
  { provider: "openai", name: "OpenAI", models: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"], voices: ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "ballad", "verse", "marin", "cedar"] },
  { provider: "aws-polly", name: "AWS Polly", models: ["standard", "neural", "long-form", "generative"], voices: ["Joanna", "Matthew", "Amy", "Brian", "Emma", "Olivia", "Aria", "Ayanda", "Salli", "Kimberly", "Kendra", "Justin", "Joey", "Ivy"] },
  { provider: "gemini", name: "Gemini", models: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"], voices: ["Kore", "Puck", "Zephyr", "Charon", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus"] },
  { provider: "xai", name: "Grok Voice", models: ["grok-tts"], voices: ["eve", "ara", "rex", "sal", "leo"] },
  { provider: "elevenlabs", name: "ElevenLabs", models: ["eleven_multilingual_v2", "eleven_v4", "eleven_flash_v2_5"], voices: ["21m00Tcm4TlvDq8ikWAM (Rachel)", "custom-id…"] },
  { provider: "speechify", name: "Speechify", models: ["simba-3.2"], voices: ["geffen_32", "dominic_32", "harper_32", "hugh_32", "imogen_32"] },
];

export function getModel(id: string): AIModel {
  const found = MODEL_CATALOG.find((m) => m.id.toLowerCase() === id.toLowerCase());
  if (found) return found;
  const short = MODEL_CATALOG.find((m) => m.id.split("/").pop()?.toLowerCase() === id.split("/").pop()?.toLowerCase());
  if (short) return short;
  // dynamic / unknown — infer caps heuristically
  const low = id.toLowerCase();
  const isOpenAI = low.includes("gpt") || low.includes("openai") || low.includes("codex") || low.includes("o1") || low.includes("o3");
  const isClaude = low.includes("claude");
  const isGeminiImg = low.includes("image");
  return {
    id, name: id, vendor: isOpenAI ? "openai" : isClaude ? "anthropic" : low.includes("gemini") || low.includes("gemma") ? "google" : low.includes("grok") ? "xai" : "custom",
    family: "Custom", tagline: "Live model from Puter catalog", context: 200000, maxOut: 32000,
    speed: 3, quality: 3, cost: 2, color: "#a1a1aa",
    caps: O({
      reasoning: low.includes("opus") || low.includes("pro") || low.includes("astra") || low.includes("reason") || low.includes("deepseek") || low.includes("qwen"),
      webSearch: isOpenAI, thinkingExtended: isClaude, verbosity: isOpenAI,
      reasoningEffort: isOpenAI, temperature: !(low.includes("astra") || low.includes("codex")),
      imageGen: isGeminiImg, imageConfig: isGeminiImg, videoUnderstand: true,
    }),
  };
}

/** Smart, precise parameter support check per selected model */
export interface ParamCheck { ok: boolean; note: string }
export function checkParams(modelId: string, p: { reasoning_effort: string; temperature: number }): Record<string, ParamCheck> {
  const m = getModel(modelId);
  const low = modelId.toLowerCase();
  const isClaude = m.vendor === "anthropic" || low.includes("claude");
  const isAstraLike = low.includes("astra") || low.includes("gpt-6.1-sol") || low.includes("codex") || m.id.includes("gpt-6.1-sol") || m.id === "gpt-6-astra";
  const effortNone = (p.reasoning_effort || "none") === "none";
  let tempOk = m.caps.temperature;
  let tempNote = "Supported · 0–2";
  if (isAstraLike) { tempOk = false; tempNote = "Omitted upstream on Astra / Sol / Codex — model controls sampling"; }
  else if ((low.includes("luna") || low.includes("sol") || low.includes("gpt-6")) && !effortNone) { tempOk = false; tempNote = "Only sent when reasoning effort = none (OpenAI rule)"; }
  return {
    temperature: { ok: tempOk, note: tempNote },
    reasoning_effort: m.caps.reasoningEffort
      ? { ok: true, note: "OpenAI + Muse Spark · lower = faster & cheaper" }
      : { ok: false, note: isClaude ? "Claude uses “Thinking effort” below (output_config.effort) — this knob is OpenAI-only" : "Only OpenAI & Muse Spark honor this — ignored otherwise" },
    verbosity: m.caps.verbosity ? { ok: true, note: "OpenAI only · low = shorter" } : { ok: false, note: "OpenAI only — ignored on this model" },
    thinking: m.caps.thinkingExtended
      ? { ok: true, note: "Puter `thinking`: adaptive · enabled+budgetTokens · disabled · between_tools" }
      : { ok: false, note: "Claude-style models only — ignored otherwise" },
    effort: m.caps.thinkingExtended
      ? { ok: true, note: "Anthropic-native · sent as output_config.effort alongside adaptive thinking (low = cheap/fast … max = deepest)" }
      : { ok: false, note: "Effort is an Anthropic knob — OpenAI models use reasoning effort above" },
    web_search: m.caps.webSearch ? { ok: true, note: "Native web_search tool available" } : { ok: false, note: "Native web search is OpenAI-only — use custom fetch tool instead" },
    image_config: m.caps.imageGen ? { ok: true, note: "Gemini image model · aspect & size apply" } : { ok: false, note: "Only Gemini image models use image_config" },
    compaction: { ok: true, note: "Inline context compaction for long chats" },
  };
}

// ─── puter loader ───
declare global { interface Window { puter?: any } }

let puterReady: Promise<any> | null = null;
export function loadPuter(timeoutMs = 15000): Promise<any> {
  if (typeof window !== "undefined" && window.puter?.ai) return Promise.resolve(window.puter);
  if (puterReady) return puterReady;
  puterReady = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (window.puter?.ai) { clearInterval(timer); resolve(window.puter); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); reject(new Error("Puter.js failed to load. Check connection / adblock.")); }
    }, 120);
    // inject if missing
    if (!document.querySelector('script[src*="js.puter.com"]')) {
      const s = document.createElement("script");
      s.src = "https://js.puter.com/v2/";
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return puterReady;
}

export async function fetchLiveModels(provider?: string): Promise<any[]> {
  try {
    const puter = await loadPuter(8000);
    const list = await puter.ai.listModels(provider || undefined);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

/** Vendors Puter can route through — `puter.ai.listModelProviders()`. */
export async function fetchProviders(): Promise<string[]> {
  try {
    const puter = await loadPuter(8000);
    if (typeof puter.ai.listModelProviders !== "function") return [];
    const list = await puter.ai.listModelProviders();
    const rows: any[] = Array.isArray(list) ? list : [];
    return rows
      .map((r: any) => (typeof r === "string" ? r : r?.id || r?.name || r?.slug))
      .filter((v: any): v is string => typeof v === "string" && v.length > 0)
      .sort();
  } catch { return []; }
}

/** Normalize chat response content to string */
export function contentToString(content: any): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b: any) => (typeof b === "string" ? b : b?.text ?? "")).join("");
  if (typeof content === "object" && content.text) return content.text;
  try { return JSON.stringify(content); } catch { return String(content); }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~4 chars per token + code/markdown overhead
  return Math.ceil(text.length / 4);
}

/** ChatResponseChunk → plain text fragment (handles every vendor shape). */
export function chunkText(part: any): string {
  if (!part) return "";
  if (typeof part === "string") return part;
  if (part.type === "error") return "";
  if (typeof part.text === "string") return part.text;
  return "";
}

/** ChatResponseChunk → reasoning fragment. */
export function chunkReasoning(part: any): string {
  if (!part || typeof part !== "object") return "";
  if (typeof part.reasoning === "string") return part.reasoning;
  if (typeof part.reasoning_text === "string") return part.reasoning_text;
  return "";
}

/**
 * ChatResponseChunk → generated image url.
 * Documented shape: `part.image` is `{ type:"image_url", image_url:{ url } }`.
 * We also tolerate a few neighbouring shapes so a streamed picture is never lost.
 */
export function chunkImage(part: any): string | null {
  if (!part || typeof part !== "object") return null;
  const cands: any[] = [part.image, part.image_url, part.type === "image_url" ? part : null];
  for (const c of cands) {
    if (!c) continue;
    const url =
      (typeof c === "string" && c.startsWith("http") ? c : null) ??
      c?.image_url?.url ??
      c?.url ??
      null;
    if (typeof url === "string" && url.length > 24) return url;
  }
  return null;
}

/** Non-streaming result → generated image urls (`message.images[]`). */
export function resultImages(res: any): string[] {
  const raw: any[] = res?.message?.images ?? res?.images ?? [];
  return raw
    .map((im: any) => (typeof im === "string" ? im : im?.image_url?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 24);
}
