// ─── Local-first persistence, types, presets ───
import { estimateTokens } from "./puter";

export interface Attachment { id: string; kind: "image" | "file" | "audio"; name: string; dataUrl: string; size: number; mime: string }
export interface ToolCallRecord { id: string; name: string; args: any; result: string; ms: number; status: "ok" | "error" }
/** One model turn inside a single assistant reply: the text it produced and the
 * tools it asked for after that text. Kept verbatim so the next request can
 * replay the tool exchange exactly as it happened (assistant tool_calls →
 * tool results), which is what stops models from "forgetting" they ran tools. */
export interface ToolTurn { text: string; calls: ToolCallRecord[] }
export interface ChatMessage {
  id: string; role: "user" | "assistant" | "system";
  text: string; reasoning?: string;
  images?: string[]; // generated / returned image urls
  audioUrl?: string;
  videoUrl?: string;
  toolCalls?: ToolCallRecord[];
  /** Faithful multi-turn tool exchange (see ToolTurn). New messages carry this;
   * older saved messages fall back to `toolCalls` + `text`. */
  turns?: ToolTurn[];
  compaction?: any;
  usage?: { in: number; out: number; total: number };
  model?: string; ts: number; error?: string;
  attachments?: Attachment[];
  isToolResult?: boolean;
}
export interface ChatSession {
  id: string; title: string; model: string; createdAt: number; updatedAt: number;
  messages: ChatMessage[]; pinned?: boolean; folder?: string;
  totalIn: number; totalOut: number;
}
export interface WorkspaceFile { id: string; name: string; kind: "note" | "image" | "audio" | "doc"; content: string; size: number; updatedAt: number; attach: boolean }
export type UIFontId = "geist" | "jetbrains" | "system";
export type CodeFontId = "geist-mono" | "jetbrains-mono";

export const UI_FONTS: { id: UIFontId; label: string; stack: string }[] = [
  { id: "geist",     label: "Geist",        stack: '"Geist", ui-sans-serif, system-ui, sans-serif' },
  { id: "jetbrains", label: "JetBrains",    stack: '"JetBrains Mono", ui-monospace, monospace' },
  { id: "system",    label: "System UI",    stack: 'ui-sans-serif, system-ui, -apple-system, sans-serif' },
];
export const CODE_FONTS: { id: CodeFontId; label: string; stack: string }[] = [
  { id: "geist-mono",     label: "Geist Mono",     stack: '"Geist Mono", ui-monospace, monospace' },
  { id: "jetbrains-mono", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
];
export const fontStack = (id: UIFontId) => UI_FONTS.find((f) => f.id === id)?.stack ?? UI_FONTS[0].stack;
export const codeStack = (id: CodeFontId) => CODE_FONTS.find((f) => f.id === id)?.stack ?? CODE_FONTS[0].stack;

export interface AppSettings {
  model: string; systemPrompt: string; temperature: number; max_tokens: number;
  reasoning_effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  verbosity: "low" | "medium" | "high";
  thinkingType: "adaptive" | "enabled" | "disabled" | "between_tools";
  thinkingBudget: number;
  /** Anthropic-native effort (sent as output_config.effort alongside adaptive thinking). */
  thinkingEffort: "low" | "medium" | "high" | "max";
  stream: boolean; testMode: boolean;
  normalize: boolean | null; compaction: boolean; compactionThreshold: number;
  toolChoice: "auto" | "none" | "required"; parallelTools: boolean;
  stopSequences: string; jsonMode: boolean; jsonSchema: string;
  imageAspect: string; imageSize: string;
  enableWebSearch: boolean; enableFunctions: boolean; enableWorkspace: boolean; enableCache: boolean;
  /** Advanced workspace modes — tools-only (default) keeps prompt lean, inject restores legacy dump */
  workspaceInject: boolean; workspaceTerminal: boolean;
  provider: string; // "" = let Puter route, else pin a vendor id
  theme: "dark" | "light"; accent: string; fontSize: number; enterToSend: boolean;
  uiFont: UIFontId; codeFont: CodeFontId; reduceMotion: boolean; density: "cozy" | "compact";
  showThinking: boolean; showTools: boolean; showTokens: boolean; confirmClear: boolean;
  ttsProvider: string; ttsVoice: string; ttsModel: string; ttsInstructions: string;
  imgModel: string; imgQuality: string; imgRatio: string;
  vidModel: string; vidSeconds: number; vidSize: string; vidAudio: boolean; vidNeg: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: "gpt-5.4-nano", systemPrompt: "You are Nexus, a precise, friendly AI assistant. Answer clearly with markdown. Be concise unless detail is asked.",
  temperature: 0.7, max_tokens: 4096, reasoning_effort: "none", verbosity: "medium",
  thinkingType: "adaptive", thinkingBudget: 4000, thinkingEffort: "high", stream: true, testMode: false,
  normalize: null, compaction: false, compactionThreshold: 60000,
  toolChoice: "auto", parallelTools: false, stopSequences: "", jsonMode: false, jsonSchema: '{\n  "type": "object",\n  "properties": { "answer": { "type": "string" } },\n  "required": ["answer"]\n}',
  imageAspect: "1:1", imageSize: "1K",
  enableWebSearch: false, enableFunctions: true, enableWorkspace: true, enableCache: true,
  workspaceInject: false, workspaceTerminal: true,
  provider: "",
  theme: "dark", accent: "#ffffff", fontSize: 14.5, enterToSend: true,
  uiFont: "geist", codeFont: "geist-mono", reduceMotion: false, density: "cozy",
  showThinking: true, showTools: true, showTokens: true, confirmClear: true,
  ttsProvider: "openai", ttsVoice: "alloy", ttsModel: "gpt-4o-mini-tts", ttsInstructions: "Sound cheerful but natural.",
  imgModel: "gemini-3.1-flash-image", imgQuality: "1K", imgRatio: "1:1",
  vidModel: "wan2.7-t2v", vidSeconds: 5, vidSize: "720P", vidAudio: true, vidNeg: "blurry, text, watermark",
};

export const SYSTEM_PRESETS = [
  { name: "Nexus Default", prompt: DEFAULT_SETTINGS.systemPrompt },
  { name: "Senior Engineer", prompt: "You are a staff-level software engineer. Give production-ready code, explain trade-offs briefly, cite files/functions, prefer TypeScript. Keep answers tight." },
  { name: "Deep Researcher", prompt: "You are a meticulous researcher. Structure answers with thesis, evidence, counterpoints, and sources-style citations. Distinguish fact vs inference. Ask before browsing assumptions." },
  { name: "Creative Writer", prompt: "You are an award-winning writer. Vivid, sensory prose. Vary rhythm. Show don't tell. Offer 2 angles when stuck." },
  { name: "Math Tutor", prompt: "You are a patient math tutor. Break problems into steps, check understanding, use LaTeX-style notation, end with a practice question." },
  { name: "Image Director", prompt: "You are an art director. When asked for images, first craft a rich visual prompt (subject, lens, light, palette, composition), then describe it. Keep it under 60 words." },
  { name: "Terse CLI", prompt: "You are a terse assistant. Minimal tokens. No preamble. Bullet points. Code first, words last." },
];

export const PROMPT_STARTERS = [
  { icon: "✦", title: "Explain a concept", prompt: "Explain quantum entanglement like I'm smart but new to physics. Use an analogy, then the real mechanism, then why it matters." },
  { icon: "⌁", title: "Write code", prompt: "Write a TypeScript function that debounces an async function with leading + trailing options, plus a React hook example." },
  { icon: "◍", title: "Generate an image", prompt: "Draw a cinematic portrait of a fox in neon Tokyo rain, 85mm, shallow depth of field", image: true },
  { icon: "◎", title: "Analyze & reason", prompt: "Compare GPT-6 Astra vs Claude Opus 5.5 vs Gemini 3.1 Pro for a long-context coding agent: pick a winner and defend it." },
  { icon: "✎", title: "Draft & edit", prompt: "Draft a launch announcement for a local-first AI studio. 3 variants: bold, minimal, playful. Then recommend one." },
  { icon: "♪", title: "Voice demo", prompt: "Write a 2-sentence voiceover script for a product film, warm and confident — I'll synthesize it in Voice Lab.", tts: true },
];

const LS = {
  get<T>(k: string, fb: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fb; } catch { return fb; } },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k: string) { try { localStorage.removeItem(k); } catch {} },
};

export const store = {
  get sessions(): ChatSession[] { return LS.get("nexus.sessions.v1", []); },
  set sessions(v: ChatSession[]) { LS.set("nexus.sessions.v1", v); },
  get settings(): AppSettings { return { ...DEFAULT_SETTINGS, ...LS.get("nexus.settings.v1", {}) }; },
  set settings(v: AppSettings) { LS.set("nexus.settings.v1", v); },
  get workspace(): WorkspaceFile[] { return LS.get("nexus.workspace.v1", []); },
  set workspace(v: WorkspaceFile[]) { LS.set("nexus.workspace.v1", v); },
  get gallery(): any[] { return LS.get("nexus.gallery.v1", []); },
  set gallery(v: any[]) { LS.set("nexus.gallery.v1", v); },
  get usage(): { in: number; out: number; calls: number } { return LS.get("nexus.usage.v1", { in: 0, out: 0, calls: 0 }); },
  set usage(v: any) { LS.set("nexus.usage.v1", v); },
  clearAll() { ["nexus.sessions.v1", "nexus.settings.v1", "nexus.workspace.v1", "nexus.gallery.v1", "nexus.usage.v1"].forEach(LS.del); },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const timeAgo = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};
export function sessionTokens(s: ChatSession) {
  let inp = s.totalIn || 0, out = s.totalOut || 0;
  if (!inp && !out) {
    s.messages.forEach((m) => { const t = estimateTokens(m.text + (m.reasoning || "")); if (m.role === "user") inp += t; else out += t; });
  }
  return { inp, out, total: inp + out };
}
export async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
}
