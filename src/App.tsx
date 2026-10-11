import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Menu, Plus, Settings2, Sparkles, Zap, Trash2, Download,
  CircleAlert, FolderOpen, Brain,
} from "lucide-react";
import {
  MODEL_CATALOG, getModel, checkParams, estimateTokens, loadPuter,
  fetchProviders, chunkText, chunkReasoning, chunkImage, resultImages,
} from "./lib/puter";
import {
  store, uid, sessionTokens, PROMPT_STARTERS, DEFAULT_SETTINGS,
  fontStack, codeStack,
  type ChatSession, type ChatMessage, type Attachment,
  type WorkspaceFile, type AppSettings, type ToolCallRecord, type ToolTurn, fileToDataUrl,
} from "./lib/store";
import { expandZip, fmtBytes, toWorkspaceFile } from "./lib/files";
import { accumulateToolCalls, extractToolCalls, isToolError, resolveToolCalls, toolInventory,
  type PendingToolBucket } from "./lib/tools";
import { LeftSidebar, SettingsDrawer, WorkspaceDrawer, NAV, type NavView } from "./components/Sidebars";
import { ImageLab, VideoLab, VoiceLab } from "./components/StudioViews";
import { Gallery } from "./components/Gallery";
import { ScrollToBottom } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { MessageList, StreamingBlock } from "./components/Thread";
import { ModelPicker, ModelTrigger } from "./components/ModelPicker";
import { Chip, IconBtn, Meter, Sheet, Btn, useMediaQuery } from "./components/ui";
import { cn } from "./utils/cn";

/* ═════════════════════ local tool definitions ═════════════════════ */

/* Tool schemas are re-sent on EVERY turn, so descriptions stay terse —
   every saved word is context the model doesn't have to read. */
const LOCAL_TOOLS = [
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evaluate a math expression.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "e.g. (240*0.15)+12" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Current date, time and timezone.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_lookup",
      description: "Search the TEXT INSIDE workspace files; returns short snippets. Content search only — it never matches file names and \"*\" is not a wildcard. Use workspace_list to list files.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_list",
      description: "List every workspace file: name, format, size and whether it is attached as context. Call this whenever the user asks what files exist in the workspace.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional case-insensitive filename filter." },
          limit: { type: "integer", description: "Maximum rows (default 80, max 200)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_write",
      description: "Create or update a workspace file (user sees & can attach it).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "file name, e.g. notes.md" },
          content: { type: "string", description: "full text (mode=replace) or text to add (mode=append)" },
          mode: { type: "string", description: "replace | append" },
        },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url_text",
      description: "Fetch a public URL as plain text.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" }, max_chars: { type: "number" } },
        required: ["url"],
      },
    },
  },
];

const HISTORY_MESSAGE_LIMIT = 24;
const HISTORY_TOOL_CALL_LIMIT = 10;

function workspaceFileFormat(file: WorkspaceFile): string {
  const baseName = file.name.split(/[\\/]/).pop() || file.name;
  const dot = baseName.lastIndexOf(".");
  const extension = dot > 0 && dot < baseName.length - 1 ? baseName.slice(dot + 1).toUpperCase() : "";
  const mime = file.content.match(/^data:([^;,]+)/)?.[1];
  return extension ? `.${extension}` : mime || `${file.kind} (no extension)`;
}

/** Keep protocol-valid JSON while preventing large tool arguments/results
 * (especially workspace_write content) from ballooning future prompts. */
function compactToolArgsForHistory(tool: ToolCallRecord): string {
  const args = Array.isArray(tool.args)
    ? { value: tool.args }
    : tool.args && typeof tool.args === "object" ? { ...tool.args } : {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== "string") continue;
    const keep = tool.name === "workspace_write" && key === "content" ? 280 : 420;
    if (value.length > keep) {
      args[key] = `${value.slice(0, keep)}\n[… ${value.length - keep} chars omitted from history …]`;
    }
  }

  try {
    const json = JSON.stringify(args);
    return json.length <= 1200 ? json : JSON.stringify({ truncated: true, preview: json.slice(0, 900) });
  } catch {
    return "{}";
  }
}

function compactToolResultForHistory(tool: ToolCallRecord): string {
  const result = String(tool.result ?? "");
  const limit = tool.name === "workspace_list" ? 3200 : tool.name === "workspace_lookup" ? 1400 : 800;
  if (result.length <= limit) return result;
  const keep = limit - 90;
  return `${result.slice(0, keep)}\n[… ${result.length - keep} chars omitted from history; full output remains visible in chat.]`;
}

function safeCalc(expr: string): string {
  try {
    let e = expr.trim()
      .replace(/\^/g, "**")
      .replace(/sqrt\(/gi, "Math.sqrt(")
      .replace(/pow\(/gi, "Math.pow(");
    if (!/^[0-9+\-*/().\s%Math,sqrta-z*,]+$/i.test(e)) throw new Error("invalid characters");
    if (e.length > 200) throw new Error("expression too long");
    // eslint-disable-next-line no-new-func
    const v = Function(
      `"use strict"; const {PI,E,sqrt,pow,sin,cos,tan,log,abs,floor,ceil,round,min,max} = Math; return (${e});`,
    )();
    if (typeof v !== "number" || !isFinite(v)) throw new Error("no numeric result");
    return `${expr} = ${v}`;
  } catch (err: any) {
    return `calc error: ${err?.message || err}`;
  }
}

function atobSafe(dataUrl: string): string {
  try {
    if (!dataUrl.startsWith("data:")) return dataUrl.slice(0, 12000);
    const [head, b64] = dataUrl.split(",");
    if (head.includes("text") || head.includes("json") || head.includes("markdown")) {
      return decodeURIComponent(escape(atob(b64.slice(0, 20000))));
    }
    return `[binary ${head} — ${b64.length} chars, preview unavailable as text]`;
  } catch {
    return "[attachment decode failed]";
  }
}

function friendlyErr(m: string): string {
  if (/network_error|request_timeout/i.test(m))
    return "The request timed out or the connection dropped. Long video & deep-reasoning calls can take minutes — retry, or lower max tokens.";
  if (/auth|sign|login|401|403|unauthor/i.test(m))
    return "Authentication needed — hit “Connect Puter” in the sidebar, then retry. (" + m.slice(0, 110) + ")";
  if (/insufficient|funds|402|balance|credit|quota/i.test(m))
    return "Not enough Puter credits for this request. Try test mode, a smaller model, or a shorter output. (" + m.slice(0, 110) + ")";
  if (/not found|unknown model|no model/i.test(m))
    return "Model not available on Puter right now — pick another from the model picker. (" + m.slice(0, 110) + ")";
  if (/trigger_tokens|compaction/i.test(m))
    return "Compaction threshold rejected by the provider — Anthropic needs at least 50,000 tokens. (" + m.slice(0, 110) + ")";
  if (/network|fetch|timeout|Failed to fetch/i.test(m))
    return "Network hiccup — check your connection and retry. (" + m.slice(0, 110) + ")";
  return m.slice(0, 400);
}

/* ═══════════════════════════════ APP ═══════════════════════════════ */

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => store.settings);
  const [sessions, setSessions] = useState<ChatSession[]>(() => store.sessions);
  const [activeId, setActiveId] = useState<string | null>(() => store.sessions[0]?.id ?? null);
  const [workspace, setWorkspace] = useState<WorkspaceFile[]>(() => store.workspace);
  const [usage, setUsage] = useState(() => store.usage);

  const [view, setView] = useState<NavView>("chat");
  const [sideOpen, setSideOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamReason, setStreamReason] = useState("");
  const [streamTools, setStreamTools] = useState<ToolCallRecord[]>([]);
  const [streamImages, setStreamImages] = useState<string[]>([]);

  const [puterOk, setPuterOk] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [liveModels, setLiveModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<string[]>([]);

  const [toasts, setToasts] = useState<{ id: string; msg: string; tone?: "ok" | "err" }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);
  const streamRef = useRef<any>(null);
  const recogRef = useRef<any>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const isPhone = useMediaQuery("(max-width: 767px)");
  const dark = settings.theme === "dark";

  const toast = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, tone }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  /* ── theme, fonts, motion ─────────────────────────────────────── */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
    document.body.style.background = dark ? "#000000" : "#ffffff";
    document.body.style.color = dark ? "#fafafa" : "#09090b";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#000000" : "#ffffff");
  }, [dark]);

  useEffect(() => {
    // Mirrors the OS media query so the in-app toggle really disables the CSS
    // entrance animations (it used to only affect framer-motion).
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  }, [settings.reduceMotion]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-sans", fontStack(settings.uiFont));
    root.style.setProperty("--font-code", codeStack(settings.codeFont));
    root.style.setProperty("--font-mono", codeStack(settings.codeFont));
  }, [settings.uiFont, settings.codeFont]);

  /* ── persist ──────────────────────────────────────────────────── */
  useEffect(() => { store.settings = settings; }, [settings]);
  useEffect(() => { store.sessions = sessions; }, [sessions]);
  useEffect(() => { store.workspace = workspace; }, [workspace]);
  useEffect(() => { store.usage = usage; }, [usage]);

  /* ── puter boot ───────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    loadPuter()
      .then(async (p) => {
        if (!alive) return;
        setPuterOk(true);
        try {
          const signed = await p.auth.isSignedIn();
          if (!alive) return;
          setAuthed(!!signed);
          if (signed) { try { setUser(await p.auth.getUser()); } catch { /* noop */ } }
        } catch { /* noop */ }
        try {
          const list = await p.ai.listModels();
          if (alive && Array.isArray(list)) setLiveModels(list);
        } catch { /* noop */ }
        fetchProviders().then((v) => { if (alive) setProviders(v); });
      })
      .catch(() => alive && setPuterOk(false));
    return () => { alive = false; };
  }, []);

  /* ── derived ──────────────────────────────────────────────────── */
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  // Tools read this instead of the captured state, so a write earlier in the
  // same run is visible to the next tool call.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // `send` reads the composer through refs so its identity does not change on
  // every keystroke — that keeps the memoised message list from re-rendering
  // while typing.
  const inputRef = useRef(input);
  inputRef.current = input;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  // Scroll bookkeeping lives in refs: touching React state on every scroll
  // event/stream chunk is what made the message list feel heavy on mobile.
  const atBottomRef = useRef(true);
  const scrollRaf = useRef<number | null>(null);
  const heightRef = useRef(0);

  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId]);
  const model = useMemo(() => getModel(settings.model), [settings.model]);
  const checks = useMemo(
    () => checkParams(settings.model, { reasoning_effort: settings.reasoning_effort, temperature: settings.temperature }),
    [settings.model, settings.reasoning_effort, settings.temperature],
  );
  const effectiveStream = settings.stream && !model.caps.imageGen;

  const updateSession = useCallback((id: string, fn: (s: ChatSession) => ChatSession) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
  }, []);

  /* ── seed a first session ─────────────────────────────────────── */
  useEffect(() => {
    if (sessions.length === 0) {
      const s: ChatSession = {
        id: uid(), title: "New conversation", model: settings.model,
        createdAt: Date.now(), updatedAt: Date.now(), messages: [],
        totalIn: 0, totalOut: 0,
      };
      setSessions([s]);
      setActiveId(s.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newChat = useCallback(() => {
    abortRef.current = true;
    streamRef.current?.return?.();
    setStreaming(false);
    setStreamText(""); setStreamReason(""); setStreamTools([]); setStreamImages([]);
    const s: ChatSession = {
      id: uid(), title: "New conversation", model: settings.model,
      createdAt: Date.now(), updatedAt: Date.now(), messages: [],
      totalIn: 0, totalOut: 0,
    };
    setSessions((p) => [s, ...p]);
    setActiveId(s.id);
    setView("chat");
    setInput("");
    setAttachments([]);
    setTimeout(() => taRef.current?.focus(), 60);
  }, [settings.model]);

  const doAuth = useCallback(async () => {
    try {
      const p = await loadPuter();
      if (authed) {
        await p.auth.signOut();
        setAuthed(false); setUser(null);
        toast("Signed out of Puter");
      } else {
        await p.auth.signIn();
        const u = await p.auth.getUser().catch(() => null);
        setUser(u); setAuthed(true);
        setPuterOk(true);
        toast(u?.username ? `Signed in as ${u.username}` : "Puter connected");
        // refresh the live catalog now that we have a session
        p.ai.listModels().then((l: any) => Array.isArray(l) && setLiveModels(l)).catch(() => {});
        fetchProviders().then(setProviders);
      }
    } catch (e: any) {
      toast("Auth: " + (e?.message || e), "err");
    }
  }, [authed, toast]);

  /* ── local tools ────────────────────────────────────────────────
     Every tool reads `workspaceRef.current`, never the captured `workspace`
     state: a `workspace_write` performed earlier in the same run used to be
     invisible to a following `workspace_list`/`lookup` (stale closure), which
     made the AI look like it had no access to the files it had just written. */
  const runLocalTool = useCallback(async (name: string, args: any): Promise<string> => {
    if (name === "calculator") return safeCalc(String(args?.expression ?? ""));
    if (name === "get_datetime") {
      const d = new Date();
      return `${d.toString()}\nISO: ${d.toISOString()}\nTZ offset: ${-d.getTimezoneOffset() / 60}h`;
    }
    if (name === "workspace_lookup") {
      const raw = String(args?.query ?? "").trim();
      const q = raw.toLowerCase();
      const files = workspaceRef.current;
      const textFiles = files.filter((f) => f.kind !== "image" && !!f.content && !f.content.startsWith("data:"));

      // Models habitually call this with "*"/"" to "list everything". Answer the
      // real question instead of a dead-end "No matches".
      if (!q || q === "*" || q === "all" || q === "list" || q === "everything") {
        return [
          "workspace_lookup searches the text INSIDE files — it never matches file names, and \"*\" is not a wildcard.",
          files.length
            ? `The workspace currently holds ${files.length} file(s): ${files.map((f) => f.name).slice(0, 40).join(", ")}. Call workspace_list for formats, sizes and attachment status.`
            : "The workspace is currently empty (0 files).",
        ].join("\n");
      }

      const hits: string[] = [];
      for (const f of textFiles) {
        if (hits.length >= 6) break;
        const idx = f.content.toLowerCase().indexOf(q);
        const tag = f.attach ? "" : " (not attached — ask the user to attach it for inline context)";
        if (idx >= 0) {
          hits.push(`### ${f.name}${tag} — content match\n…${f.content.slice(Math.max(0, idx - 160), idx + 480)}…`);
        } else if (f.name.toLowerCase().includes(q)) {
          hits.push(`### ${f.name}${tag} — filename match (no content match)\n${f.content.slice(0, 300)}`);
        }
      }
      if (hits.length) return hits.join("\n\n").slice(0, 4500);
      return `No content matches for “${raw}” across ${textFiles.length} searchable text file(s)`
        + (files.length !== textFiles.length ? ` (out of ${files.length} total — images/binary are not searchable)` : "")
        + ". This is a content search; use workspace_list to list file names.";
    }
    if (name === "workspace_list") {
      const files = workspaceRef.current;
      const query = String(args?.query ?? "").trim().toLowerCase();
      const matches = files.filter((file) => !query || file.name.toLowerCase().includes(query));
      if (!matches.length) {
        return query
          ? `No workspace filenames match “${query}”. The workspace holds ${files.length} file(s).`
          : "Workspace is empty (0 files).";
      }

      const requestedLimit = Math.floor(Number(args?.limit) || 80);
      const limit = Math.max(1, Math.min(200, requestedLimit));
      const shown = matches.slice(0, limit);
      const rows = shown.map((file, index) => {
        const name = file.name.replace(/[\r\n|]/g, " ");
        return `${index + 1}. ${name} | ${workspaceFileFormat(file)} | ${fmtBytes(file.size)} | ${file.attach ? "attached" : "not attached"}`;
      });
      const suffix = matches.length > shown.length ? `\n… ${matches.length - shown.length} more file(s); use a filename filter to narrow the list.` : "";
      const output = `Workspace files (${matches.length} total; showing ${shown.length}):\n${rows.join("\n")}${suffix}`;
      return output.length <= 12000
        ? output
        : `${output.slice(0, 11850)}\n… output clipped; lower the limit or filter filenames to see a complete list.`;
    }
    if (name === "workspace_write") {
      const fname = String(args?.name ?? "").trim();
      const content = String(args?.content ?? "");
      if (!fname) return "workspace_write error: name is required";
      if (content.length > 120000) return "workspace_write error: content over 120k chars";
      const mode = args?.mode === "append" ? "append" : "replace";
      const prev = workspaceRef.current;
      const i = prev.findIndex((f) => f.name.toLowerCase() === fname.toLowerCase());
      const nextContent = mode === "append" && i >= 0 ? prev[i].content + "\n" + content : content;
      const wrote: WorkspaceFile = {
        id: i >= 0 ? prev[i].id : uid(),
        name: fname, kind: "doc", content: nextContent,
        size: nextContent.length, updatedAt: Date.now(), attach: i >= 0 ? prev[i].attach : true,
      };
      const next = i >= 0 ? prev.map((f, k) => (k === i ? wrote : f)) : [wrote, ...prev];
      // Update the ref first so a tool call later in this same run sees the file.
      workspaceRef.current = next;
      setWorkspace(next);
      toast(`${mode === "append" ? "Appended to" : "Saved"} ${fname} in workspace`);
      return `OK — ${mode === "append" ? "appended to" : "wrote"} ${fname} (${content.length} chars). It is now in the user's workspace${mode === "replace" ? " and attached as context" : ""}.`;
    }
    if (name === "fetch_url_text") {
      try {
        const url = String(args?.url ?? "");
        if (!/^https?:\/\//i.test(url)) return "fetch_url_text error: url must start with http(s)://";
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) return `fetch_url_text error: HTTP ${r.status} ${r.statusText}`;
        const t = await r.text();
        const text = t
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text.slice(0, Math.min(Number(args?.max_chars) || 4000, 8000));
      } catch (e: any) {
        return "fetch_url_text error: " + (e?.message || e);
      }
    }
    return `unknown tool: ${name}`;
  }, [toast]);

  const buildTools = useCallback(() => {
    const tools: any[] = [];
    // Native web search exists only when the setting is on AND the model
    // supports it — and only then does it replace the custom fetch tool.
    const nativeWeb = settings.enableWebSearch && model.caps.webSearch;
    if (nativeWeb) tools.push({ type: "web_search" });
    if (settings.enableFunctions) {
      let fns: any[] = [...LOCAL_TOOLS];
      if (!settings.enableWorkspace) fns = fns.filter((t: any) => !t.function.name.startsWith("workspace_"));
      if (nativeWeb) fns = fns.filter((t: any) => t.function.name !== "fetch_url_text");
      tools.push(...fns);
    }
    return tools;
  }, [settings.enableWebSearch, settings.enableFunctions, settings.enableWorkspace, model.caps.webSearch]);

  /**
   * History builder. Honours Puter's compaction contract: if an earlier turn
   * produced a compaction artifact, that artifact stands in for everything
   * before it, so we restart the window there instead of resending it all.
   */
  const buildMessages = useCallback((sess: ChatSession, userText: string, atts: Attachment[], currentUserId: string, tools: any[]) => {
    const attached = settings.enableWorkspace ? workspace.filter((f) => f.attach && f.kind !== "image") : [];
    const wsImages = settings.enableWorkspace ? workspace.filter((f) => f.attach && f.kind === "image").slice(0, 3) : [];

    let sys = settings.systemPrompt;
    // The tool list is stated explicitly and authoritatively: models otherwise
    // repeat a (wrong) inventory they wrote earlier in the chat and refuse work
    // with "I can't list files directly" even though the tool was right there.
    sys += `\n\nTool policy — the list below is authoritative and overrides anything said earlier in this conversation:\n${toolInventory(tools)}\n`
      + "- Only these tools exist this turn. Never invent a tool, and ignore any earlier message that claimed a different tool list.\n"
      + "- Tool calls and their results from earlier turns are replayed in this conversation as real assistant/tool messages. They already happened: never tell the user you \"never ran\" a tool whose call and result are visible here.\n"
      + "- Never answer questions about the workspace from memory: call workspace_list first (for file names/metadata) or workspace_lookup (to search file contents), then answer from the result.\n"
      + "- If a result is missing or truncated, rerun the tool when it is available; otherwise say so plainly.";
    if (attached.length) {
      // Budgeted: metadata and deeper snippets remain available through tools.
      const ctx = attached
        .map((f) => `### ${f.name}\n${f.content.slice(0, 4000)}`)
        .join("\n\n")
        .slice(0, 10000);
      sys += `\n\n[WORKSPACE CONTEXT — attached local files]\n${ctx}`;
    }
    const sysMsg: any = { role: "system", content: sys };
    if (settings.enableCache && (model.vendor === "anthropic" || settings.model.toLowerCase().includes("claude"))) {
      sysMsg.cache_control = { type: "ephemeral" };
    }

    // Exclude the current user turn (it is appended once below), and retain the
    // newest history rather than repeatedly sending the oldest 24 messages.
    const usable = sess.messages.filter((m) => m.id !== currentUserId && m.role !== "system" && !m.error);
    let compactionIndex = -1;
    for (let i = usable.length - 1; i >= 0; i--) {
      if (usable[i].role === "assistant" && usable[i].compaction) { compactionIndex = i; break; }
    }
    const afterCompaction = compactionIndex >= 0 ? usable.slice(compactionIndex) : [];
    const historyMessages = compactionIndex >= 0
      ? afterCompaction.length <= HISTORY_MESSAGE_LIMIT
        ? afterCompaction
        : [afterCompaction[0], ...afterCompaction.slice(-(HISTORY_MESSAGE_LIMIT - 1))]
      : usable.slice(-HISTORY_MESSAGE_LIMIT);

    // Decide which recorded tool turns are replayed (newest first, whole turns
    // only — a tool call is never replayed without its result). Payloads are
    // clipped; the full output stays visible in the saved ToolTray.
    const keptTurns = new Map<number, Set<number>>();
    let callsLeft = HISTORY_TOOL_CALL_LIMIT;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const turns = historyMessages[i].turns ?? [];
      if (!turns.length) continue;
      const keep = new Set<number>();
      for (let t = turns.length - 1; t >= 0; t--) {
        const count = turns[t].calls?.length ?? 0;
        if (count === 0) { keep.add(t); continue; }
        if (count > callsLeft) break;
        keep.add(t);
        callsLeft -= count;
      }
      keptTurns.set(i, keep);
    }

    // Legacy fallback for chats saved before `turns` existed.
    const retainedToolCalls = new Set<string>();
    callsLeft = HISTORY_TOOL_CALL_LIMIT;
    for (let i = historyMessages.length - 1; i >= 0 && callsLeft > 0; i--) {
      if (historyMessages[i].turns?.length) continue;
      const calls = historyMessages[i].toolCalls ?? [];
      for (let j = calls.length - 1; j >= 0 && callsLeft > 0; j--) {
        retainedToolCalls.add(`${i}:${j}`);
        callsLeft--;
      }
    }

    const hist: any[] = historyMessages.flatMap((m, idx) => {
      if (m.isToolResult) {
        const result = String((m as any).content ?? m.text ?? "");
        return [{ role: "assistant", content: `[Earlier tool output]\n${result.slice(0, 800)}` }];
      }
      if (m.role !== "assistant") return [{ role: m.role, content: m.text }];

      /* Faithful replay of a recorded multi-turn tool exchange: each turn is
         re-emitted as assistant(text + tool_calls) → tool(results), exactly as
         the live loop built it. This is what keeps the model aware of the tool
         work it already did (previously the pre-tool narration and the answer
         were merged into one message and the calls could go missing). */
      if (m.turns?.length) {
        const keep = keptTurns.get(idx) ?? new Set<number>();
        const kept = m.turns.filter((_, t) => keep.has(t));
        const dropped = m.turns.length - kept.length;
        const isAnchor = idx === 0 && !!m.compaction;

        if (!kept.length) {
          const content: any = isAnchor
            ? m.text ? [m.compaction, { type: "text", text: m.text }] : [m.compaction]
            : m.text || "";
          return [{ role: "assistant", content }];
        }

        const out: any[] = [];
        kept.forEach((turn, t) => {
          const note = t === 0 && dropped ? `[${dropped} earlier tool turn(s) omitted to save context — rerun a tool if needed.]` : "";
          const text = [turn.text, note].filter(Boolean).join("\n");
          const msg: any = { role: "assistant" };
          if (isAnchor && t === 0) {
            msg.content = text ? [m.compaction, { type: "text", text }] : [m.compaction];
          } else if (text) {
            msg.content = text;
          }
          if (turn.calls?.length) {
            msg.tool_calls = turn.calls.map((tool) => ({
              id: tool.id,
              type: "function",
              function: { name: tool.name, arguments: compactToolArgsForHistory(tool) },
            }));
          }
          out.push(msg);
          for (const tool of turn.calls ?? []) {
            out.push({ role: "tool", tool_call_id: tool.id, content: compactToolResultForHistory(tool) });
          }
        });
        return out;
      }

      const allCalls = m.toolCalls ?? [];
      const calls = allCalls.filter((_, callIndex) => retainedToolCalls.has(`${idx}:${callIndex}`));
      const omitted = allCalls.length - calls.length;
      const isCompactionAnchor = idx === 0 && !!m.compaction;
      const omittedNote = omitted
        ? `[${omitted} earlier tool call(s) from this turn were omitted to save context; their results are unavailable here. Run a tool again if needed.]`
        : "";

      if (!calls.length) {
        let content: any = isCompactionAnchor
          ? m.text ? [m.compaction, { type: "text", text: m.text }] : [m.compaction]
          : m.text || "";
        if (omittedNote) {
          content = Array.isArray(content)
            ? [...content, { type: "text", text: omittedNote }]
            : [ ...(content ? [{ type: "text", text: String(content) }] : []), { type: "text", text: omittedNote } ];
        }
        return [{ role: "assistant", content }];
      }

      const callContent: any = isCompactionAnchor
        ? [m.compaction, ...(omittedNote ? [{ type: "text", text: omittedNote }] : [])]
        : omittedNote;
      const callMessage: any = {
        role: "assistant",
        tool_calls: calls.map((tool) => ({
          id: tool.id,
          type: "function",
          function: { name: tool.name, arguments: compactToolArgsForHistory(tool) },
        })),
      };
      // An assistant turn whose only content is an empty string gets dropped or
      // rejected by some providers, which used to erase the model's own tool
      // history. Omit the key entirely instead.
      if (callContent) callMessage.content = callContent;
      const resultMessages = calls.map((tool) => ({
        role: "tool", tool_call_id: tool.id, content: compactToolResultForHistory(tool),
      }));
      const finalAnswer = m.text && m.text !== "—" ? [{ role: "assistant", content: m.text }] : [];
      return [callMessage, ...resultMessages, ...finalAnswer];
    });

    let fullText = userText;
    const fileTexts = atts
      .filter((a) => a.kind === "file")
      .map((a) => `\n\n[ATTACHED FILE: ${a.name}]\n${atobSafe(a.dataUrl)}`.slice(0, 12000));
    if (fileTexts.length) fullText += fileTexts.join("");
    const auds = atts.filter((a) => a.kind === "audio");
    if (auds.length) {
      fullText += `\n\n[NOTE: user attached ${auds.length} audio file(s) — acknowledge and offer to transcribe in the Voice Lab if needed.]`;
    }

    const imgUrls = [
      ...atts.filter((a) => a.kind === "image").map((a) => a.dataUrl),
      ...wsImages.map((f) => f.content),
    ].slice(0, 4);

    const userMsg: any = imgUrls.length
      ? {
          role: "user",
          content: [
            { type: "text", text: fullText },
            ...imgUrls.map((u) => ({ type: "image_url", image_url: { url: u } })),
          ],
        }
      : { role: "user", content: fullText };

    return { msgs: [sysMsg, ...hist, userMsg], imgCount: imgUrls.length };
  }, [settings.systemPrompt, settings.enableFunctions, settings.enableWorkspace, settings.enableCache, settings.model, workspace, model.vendor]);

  const buildOpts = useCallback((tools: any[]) => {
    const o: any = { model: settings.model, stream: settings.stream };
    if (settings.provider) o.provider = settings.provider;
    if (checks.temperature.ok) o.temperature = settings.temperature;
    o.max_tokens = settings.max_tokens;
    if (checks.reasoning_effort.ok && settings.reasoning_effort !== "none") o.reasoning_effort = settings.reasoning_effort;
    if (checks.verbosity.ok && settings.verbosity !== "medium") o.verbosity = settings.verbosity;
    if (checks.thinking.ok) {
      if (settings.thinkingType === "enabled") o.thinking = { type: "enabled", budgetTokens: settings.thinkingBudget };
      else o.thinking = { type: settings.thinkingType };
    }
    // Anthropic-native effort (Claude 4.6+): pairs with adaptive thinking and
    // replaces the deprecated budget_tokens knob. Puter documents `thinking`;
    // `output_config.effort` rides along for routers that forward it.
    if (checks.effort?.ok) o.output_config = { effort: settings.thinkingEffort };
    if (tools.length) {
      o.tools = tools;
      if (settings.toolChoice !== "auto") o.toolChoice = settings.toolChoice;
      o.parallelToolCalls = settings.parallelTools;
    }
    if (settings.stopSequences.trim()) {
      o.stopSequences = settings.stopSequences.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
    }
    if (settings.jsonMode) {
      try {
        o.outputFormat = {
          type: "json_schema", name: "nexus_output", strict: false,
          schema: JSON.parse(settings.jsonSchema),
        };
      } catch { /* invalid schema — skip rather than break the call */ }
    }
    if (settings.compaction) {
      o.compaction = settings.compactionThreshold ? { trigger_tokens: settings.compactionThreshold } : true;
    }
    if (settings.normalize !== null) o.normalize = settings.normalize;
    if (checks.image_config.ok) {
      o.image_config = { aspect_ratio: settings.imageAspect, image_size: settings.imageSize };
    }
    return o;
  }, [settings, checks]);

  // testMode is a *positional* argument in puter.js, not an option.
  const callChat = useCallback(async (puter: any, conversation: any[], opts: any, stream: boolean) => {
    const o = { ...opts, stream };
    return settings.testMode ? puter.ai.chat(conversation, true, o) : puter.ai.chat(conversation, o);
  }, [settings.testMode]);

  /* ═══════════════════════ SEND ═══════════════════════ */
  const send = useCallback(async (override?: string, editId?: string) => {
    const text = (override ?? inputRef.current).trim();
    const pendingAtts = attachmentsRef.current;
    if ((!text && pendingAtts.length === 0) || streaming) return;

    let sess = sessionsRef.current.find((s) => s.id === activeId);
    if (!sess) return;

    if (editId) {
      sess = { ...sess, messages: sess.messages.filter((m) => m.id !== editId) };
      setSessions((p) => p.map((s) => (s.id === sess!.id ? sess! : s)));
      sessionsRef.current = sessionsRef.current.map((s) => (s.id === sess!.id ? sess! : s));
    }

    const userMsg: ChatMessage = {
      id: uid(), role: "user", text: text || "(attachments)",
      ts: Date.now(), model: settings.model,
      attachments: pendingAtts.length ? [...pendingAtts] : undefined,
    };
    const base: ChatSession = {
      ...sess,
      model: settings.model,
      updatedAt: Date.now(),
      title: sess.messages.length === 0 ? (text.slice(0, 46) || "New conversation") : sess.title,
      messages: [...sess.messages, userMsg],
    };
    setSessions((p) => p.map((s) => (s.id === base.id ? base : s)));
    sessionsRef.current = sessionsRef.current.map((s) => (s.id === base.id ? base : s));
    setInput(""); setAttachments([]); setView("chat");
    setStreaming(true); abortRef.current = false;
    setStreamText(""); setStreamReason(""); setStreamTools([]); setStreamImages([]);
    setAtBottom(true);

    try {
      const puter = await loadPuter();

      // Auto-transcribe attached audio locally before chatting.
      let enrichedText = userMsg.text;
      const auds = (userMsg.attachments || []).filter((a) => a.kind === "audio");
      if (auds.length) {
        setStreamText("Transcribing audio…");
        for (const a of auds.slice(0, 2)) {
          try {
            const r: any = await puter.ai.speech2txt(a.dataUrl, { model: "whisper-1" });
            const t = typeof r === "string" ? r : r?.text || "";
            if (t) enrichedText += `\n\n[VOICE TRANSCRIPT (${a.name})]\n${t.slice(0, 6000)}`;
          } catch {
            enrichedText += `\n\n[audio ${a.name} could not be transcribed]`;
          }
        }
        setSessions((p) => p.map((s) => s.id === base.id
          ? { ...s, messages: s.messages.map((m) => (m.id === userMsg.id ? { ...m, text: enrichedText } : m)) }
          : s));
      }

      const tools = buildTools();
      const convoBase = { ...base, messages: base.messages.map((m) => (m.id === userMsg.id ? { ...m, text: enrichedText } : m)) };
      const { msgs } = buildMessages(convoBase, enrichedText, userMsg.attachments || [], userMsg.id, tools);
      const opts = buildOpts(tools);

      let conversation: any[] = [...msgs];
      // One entry per model turn. Each turn's text is joined with a blank line
      // (previously the pre-tool narration and the final answer were glued
      // together: "…see what comes back.The search returned nothing"), and the
      // whole structure is saved so the next request replays it verbatim.
      const turns: ToolTurn[] = [];
      const turnTextOf = (t: ToolTurn) => t.text;
      const finalTextOf = () => turns.map(turnTextOf).filter((t) => t && t.trim()).join("\n\n");
      let finalReason = "";
      const allTools: ToolCallRecord[] = [];
      const finalImages: string[] = [];
      let compaction: any = null;
      let inTok = estimateTokens(JSON.stringify(conversation)), outTok = 0;

      for (let turn = 0; turn < 5; turn++) {
        if (abortRef.current) break;

        if (effectiveStream) {
          let turnText = "", turnReason = "";
          const pendingToolCalls: PendingToolBucket = new Map();
          const resp = await callChat(puter, conversation, opts, true);
          streamRef.current = resp;

          for await (const part of resp) {
            if (abortRef.current) break;
            if (!part) continue;
            if (part.type === "error" || part.error) {
              throw new Error(part.message || part.error || "stream error");
            }
            const t = chunkText(part);
            if (t) {
              turnText += t;
              const live = turns.map(turnTextOf).filter(Boolean);
              if (turnText.trim()) live.push(turnText);
              setStreamText(live.join("\n\n"));
            }

            const r = chunkReasoning(part);
            if (r) { turnReason += r; setStreamReason(finalReason + turnReason); }

            // Streamed image chunks — without this, image models showed nothing.
            const img = chunkImage(part);
            if (img && !finalImages.includes(img)) {
              finalImages.push(img);
              setStreamImages([...finalImages]);
            }

            if (part.type === "compaction" || part.compaction) compaction = part.compaction || part;

            accumulateToolCalls(pendingToolCalls, part);
          }

          finalReason += turnReason;
          outTok += estimateTokens(turnText + turnReason);

          const pendingTools = resolveToolCalls(pendingToolCalls);

          // web_search is executed upstream by the provider; only local tools run here.
          const localCalls = pendingTools.filter((c) => c.name !== "web_search");

          const turnRecs: ToolCallRecord[] = [];
          const seenCalls = new Set<string>();
          for (const call of localCalls) {
            const fingerprint = `${call.name}:${JSON.stringify(call.args ?? {})}`;
            if (seenCalls.has(fingerprint)) continue; // some providers repeat a call in deltas
            seenCalls.add(fingerprint);
            const t0 = performance.now();
            const result = String(await runLocalTool(call.name, call.args ?? {}));
            const rec: ToolCallRecord = {
              id: call.id || uid(), name: call.name, args: call.args ?? {},
              result: result.slice(0, call.name === "workspace_list" ? 12000 : 4000),
              ms: Math.round(performance.now() - t0),
              status: isToolError(result) ? "error" : "ok",
            };
            turnRecs.push(rec);
            allTools.push(rec);
            setStreamTools([...allTools]);
          }

          if (turnText.trim() || turnRecs.length) turns.push({ text: turnText, calls: turnRecs });

          if (!pendingTools.length || !localCalls.length || !turnRecs.length) break;

          const assistantTurn: any = {
            role: "assistant",
            tool_calls: turnRecs.map((r) => ({
              id: r.id, type: "function",
              function: { name: r.name, arguments: JSON.stringify(r.args) },
            })),
          };
          if (turnText) assistantTurn.content = turnText;
          conversation = [
            ...conversation,
            assistantTurn,
            ...turnRecs.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.result })),
          ];
          if (turn === 4) break;
        } else {
          const res: any = await callChat(puter, conversation, opts, false);
          const msg = res?.message || res;

          let content = msg?.content ?? msg?.text ?? res;
          if (Array.isArray(content)) {
            content = content
              .map((b: any) => (typeof b === "string" ? b : b?.text ?? ""))
              .join("");
          }
          const piece = typeof content === "string" ? content : String(content ?? "");
          const live = turns.map((t) => t.text).filter(Boolean);
          if (piece.trim()) live.push(piece);
          setStreamText(live.join("\n\n"));

          const rs = msg?.reasoning || res?.reasoning || "";
          if (rs) {
            finalReason += typeof rs === "string" ? rs : JSON.stringify(rs);
            setStreamReason(finalReason);
          }
          finalImages.push(...resultImages(res).filter((u) => !finalImages.includes(u)));
          if (finalImages.length) setStreamImages([...finalImages]);
          if (res?.compaction) compaction = res.compaction;

          if (res?.usage) {
            inTok = res.usage.prompt_tokens || res.usage.input_tokens || inTok;
            outTok = res.usage.completion_tokens || res.usage.output_tokens || estimateTokens(piece);
          } else {
            outTok = estimateTokens(piece);
          }

          // Accepts OpenAI `tool_calls` and Anthropic-style content blocks.
          const pendingTools = extractToolCalls(msg, res);
          const localCalls = pendingTools.filter((c) => c.name !== "web_search");

          const turnRecs: ToolCallRecord[] = [];
          for (const call of localCalls) {
            const t0 = performance.now();
            const result = String(await runLocalTool(call.name, call.args ?? {}));
            const rec: ToolCallRecord = {
              id: call.id || uid(), name: call.name, args: call.args ?? {},
              result: result.slice(0, call.name === "workspace_list" ? 12000 : 4000),
              ms: Math.round(performance.now() - t0),
              status: isToolError(result) ? "error" : "ok",
            };
            turnRecs.push(rec);
            allTools.push(rec);
            setStreamTools([...allTools]);
          }

          if (piece.trim() || turnRecs.length) turns.push({ text: piece, calls: turnRecs });
          if (!turnRecs.length) break;

          const assistantTurn: any = {
            role: "assistant",
            tool_calls: turnRecs.map((tool) => ({
              id: tool.id, type: "function",
              function: { name: tool.name, arguments: JSON.stringify(tool.args) },
            })),
          };
          if (piece) assistantTurn.content = piece;
          conversation = [
            ...conversation,
            assistantTurn,
            ...turnRecs.map((tool) => ({ role: "tool", tool_call_id: tool.id, content: tool.result })),
          ];
        }
      }

      let finalText = finalTextOf();
      if (!finalText && !finalImages.length && model.caps.imageGen) {
        finalText = "(the image model returned no text — check the gallery or retry)";
      }

      // `toolCalls` keeps the full detail for the chat UI; `turns` (what gets
      // replayed and persisted) stores the same exchange with the same clipping
      // the history builder would apply, so localStorage does not double up.
      const persistedTurns: ToolTurn[] | undefined = allTools.length && turns.length
        ? turns.map((turn) => ({
            text: turn.text,
            calls: turn.calls.map((call) => ({ ...call, result: compactToolResultForHistory(call) })),
          }))
        : undefined;

      const assistant: ChatMessage = {
        id: uid(), role: "assistant", text: finalText || "—",
        reasoning: finalReason || undefined,
        images: finalImages.length ? finalImages : undefined,
        toolCalls: allTools.length ? allTools : undefined,
        turns: persistedTurns,
        compaction: compaction || undefined,
        usage: { in: inTok, out: outTok, total: inTok + outTok },
        model: settings.model, ts: Date.now(),
      };
      updateSession(base.id, (s) => ({
        ...s,
        updatedAt: Date.now(),
        messages: [...s.messages, assistant],
        totalIn: (s.totalIn || 0) + inTok,
        totalOut: (s.totalOut || 0) + outTok,
      }));
      setUsage((u) => ({ in: u.in + inTok, out: u.out + outTok, calls: u.calls + 1 }));

      if (finalImages.length) {
        store.gallery = [
          ...finalImages.map((src) => ({
            src, prompt: userMsg.text.slice(0, 120), model: settings.model,
            ts: Date.now(), kind: "image", id: uid(),
          })),
          ...(store.gallery ?? []),
        ].slice(0, 60);
      }
    } catch (e: any) {
      const raw = e?.message || e?.error || String(e);
      const assistant: ChatMessage = {
        id: uid(), role: "assistant", text: "",
        ts: Date.now(), model: settings.model, error: friendlyErr(raw),
      };
      updateSession(base.id, (s) => ({ ...s, messages: [...s.messages, assistant] }));
      toast("Failed: " + friendlyErr(raw).slice(0, 90), "err");
    }

    streamRef.current = null;
    setStreaming(false);
    setStreamText(""); setStreamReason(""); setStreamTools([]); setStreamImages([]);
  }, [
    streaming, activeId, settings, buildTools, buildMessages,
    buildOpts, callChat, effectiveStream, runLocalTool, updateSession, model.caps.imageGen, toast,
  ]);

  const stop = useCallback(() => {
    abortRef.current = true;
    streamRef.current?.return?.();
    setStreaming(false);
  }, []);

  const regen = useCallback(() => {
    const cur = sessionsRef.current.find((s) => s.id === activeId);
    if (!cur || streaming) return;
    const lastUser = [...cur.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = cur.messages.lastIndexOf(lastUser);
    const next = { ...cur, messages: cur.messages.slice(0, idx), updatedAt: Date.now() };
    setSessions((p) => p.map((s) => (s.id === cur.id ? next : s)));
    sessionsRef.current = sessionsRef.current.map((s) => (s.id === cur.id ? next : s));
    setAttachments(lastUser.attachments ? [...lastUser.attachments] : []);
    setTimeout(() => send(lastUser.text), 140);
  }, [activeId, send, streaming]);

  /* ── voice input ───────────────────────────────────────────────── */
  const toggleMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast("Voice input isn't supported in this browser — try Chrome.", "err"); return; }
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    recogRef.current = r;
    r.lang = "en-US";
    r.interimResults = true;
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join("");
      setInput((p) => (p ? p + " " : "") + t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    setListening(true);
  }, [listening, toast]);

  const speak = useCallback(async (text: string) => {
    try {
      const p = await loadPuter();
      let voice = settings.ttsVoice, vmodel: any = settings.ttsModel;
      const OPENAI_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "ballad", "verse", "marin", "cedar"];
      if (settings.ttsProvider === "openai" && !OPENAI_VOICES.includes(voice)) { voice = "alloy"; vmodel = "gpt-4o-mini-tts"; }
      if (settings.ttsProvider === "aws-polly" && voice.length > 20) voice = "Joanna";
      const a: any = await p.ai.txt2speech(text.slice(0, 1200), {
        provider: settings.ttsProvider, voice, model: vmodel,
        engine: settings.ttsProvider === "aws-polly" ? vmodel : undefined,
      });
      new Audio(a.src).play().catch(() => {});
      toast("Playing response audio");
    } catch {
      try {
        speechSynthesis.speak(new SpeechSynthesisUtterance(text.slice(0, 800)));
        toast("Browser voice (Puter TTS unavailable)");
      } catch { toast("TTS failed", "err"); }
    }
  }, [settings.ttsProvider, settings.ttsVoice, settings.ttsModel, toast]);

  const onPickFiles = useCallback(async (files: FileList | null, kind: "image" | "file" | "audio") => {
    if (!files) return;
    const list: Attachment[] = [];
    const zips: File[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (/\.zip$/i.test(f.name)) { zips.push(f); continue; }
      const d = await fileToDataUrl(f);
      list.push({
        id: uid(),
        kind: f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : kind === "file" ? "file" : kind,
        name: f.name, dataUrl: d, size: f.size, mime: f.type,
      });
    }
    setAttachments((a) => [...a, ...list].slice(0, 6));
    if (list.length) toast(`Attached ${list.length} file${list.length > 1 ? "s" : ""}`);
    // .zip → auto-extract straight into the workspace (text + images).
    for (const z of zips) {
      const items = await expandZip(z);
      if (!items.length) { toast(`Could not read ${z.name} as a zip`, "err"); continue; }
      const next = [...items.map((i) => toWorkspaceFile(i)), ...workspaceRef.current];
      workspaceRef.current = next;
      setWorkspace(next);
      toast(`Unzipped ${items.length} file${items.length > 1 ? "s" : ""} from ${z.name} → workspace`);
    }
  }, [toast]);

  const exportChat = (fmt: "md" | "json") => {
    if (!active) return;
    const body = fmt === "md"
      ? `# ${active.title}\n\n_Model: ${active.model} · ${new Date(active.createdAt).toLocaleString()}_\n\n` +
        active.messages
          .map((m) => `## ${m.role}\n${m.reasoning ? `<details><summary>thinking</summary>\n\n${m.reasoning}\n\n</details>\n\n` : ""}${m.text}`)
          .join("\n\n---\n\n")
      : JSON.stringify(active, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    a.download = `nexus-${active.title.slice(0, 30).replace(/\W+/g, "-")}.${fmt}`;
    a.click();
    toast("Exported ." + fmt);
  };

  /* ── autoscroll (only while pinned to the bottom) ────────────────
     Scroll events are rAF-throttled and only touch React state when the value
     actually flips. The old handler called setState on every scroll event, and
     React can re-render once even when the value is unchanged — that is what
     made dragging the conversation stutter on a phone. */
  const onScroll = useCallback(() => {
    if (scrollRaf.current !== null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const next = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
      if (next !== atBottomRef.current) {
        atBottomRef.current = next;
        setAtBottom(next);
      }
    });
  }, []);
  useEffect(() => () => { if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current); }, []);

  useEffect(() => {
    if (!atBottom) return;
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      // Only touch scrollTop when the content actually grew (one write per frame).
      if (el.scrollHeight !== heightRef.current) {
        heightRef.current = el.scrollHeight;
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [active?.messages.length, streamText, streamReason, streamImages.length, atBottom]);

  useEffect(() => {
    atBottomRef.current = true;
    heightRef.current = 0;
    setAtBottom(true);
  }, [activeId]);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  /* ── keyboard shortcuts ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setModelOpen(true); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChat(); }
      else if (mod && e.key === "/") { e.preventDefault(); setSetOpen(true); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setSideOpen((v) => !v); }
      else if (e.key === "Escape") {
        if (modelOpen) setModelOpen(false);
        else if (confirmClear) setConfirmClear(false);
        else if (setOpen) setSetOpen(false);
        else if (wsOpen) setWsOpen(false);
        else if (sideOpen) setSideOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modelOpen, confirmClear, setOpen, wsOpen, sideOpen, newChat]);

  /* ── edge-swipe to open the sidebar on phones ──────────────────── */
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isPhone || sideOpen) return;
    const t = e.touches[0];
    if (t.clientX < 26) touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchStart.current;
    if (!s) return;
    const t = e.touches[0];
    if (t.clientX - s.x > 58 && Math.abs(t.clientY - s.y) < 40) {
      setSideOpen(true);
      touchStart.current = null;
    }
  };

  /* ── derived numbers ───────────────────────────────────────────── */
  const sessToks = active ? sessionTokens(active) : { inp: 0, out: 0, total: 0 };
  const ctxPct = Math.min(100, (sessToks.total / model.context) * 100);
  const estInput = estimateTokens(input);
  const wsAttached = workspace.filter((f) => f.attach).length;
  const toolCount = buildTools().length;
  const showEmpty = view === "chat" && (!active || active.messages.length === 0);

  const densityGap = settings.density === "compact" ? "space-y-3" : "space-y-6";

  /* ── memo-friendly handlers ────────────────────────────────────────
     The heavy children (message list, sidebar, drawers, composer) are memoised;
     that only pays off if every prop keeps its identity between renders, so
     every handler passed down is wrapped here. */
  const onCopyMsg = useCallback((m: ChatMessage) => {
    navigator.clipboard.writeText(m.text).catch(() => {});
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1300);
  }, []);

  const onEditMsg = useCallback((m: ChatMessage) => {
    if (!activeId) return;
    setInput(m.text);
    updateSession(activeId, (s) => ({ ...s, messages: s.messages.filter((x) => x.id !== m.id) }));
    setTimeout(() => taRef.current?.focus(), 60);
  }, [activeId, updateSession]);

  const onDeleteMsg = useCallback((m: ChatMessage) => {
    if (!activeId) return;
    updateSession(activeId, (s) => ({ ...s, messages: s.messages.filter((x) => x.id !== m.id) }));
  }, [activeId, updateSession]);

  const onSelectSession = useCallback((id: string) => {
    setActiveId(id);
    const s = sessionsRef.current.find((x) => x.id === id);
    if (s?.model) setSettings((prev) => ({ ...prev, model: s.model }));
  }, []);

  const onDeleteSession = useCallback((id: string) => {
    const remaining = sessionsRef.current.filter((s) => s.id !== id);
    setSessions(remaining);
    sessionsRef.current = remaining;
    setActiveId((cur) => (cur === id ? remaining[0]?.id ?? null : cur));
    toast("Chat deleted");
  }, [toast]);

  const onPinSession = useCallback((id: string) => {
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  }, []);

  const onRenameSession = useCallback((id: string, t: string) => {
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, title: t } : s)));
  }, []);

  const onPickModel = useCallback((id: string) => {
    setSettings((s) => ({ ...s, model: id }));
    if (activeId) updateSession(activeId, (s) => ({ ...s, model: id }));
    toast(`Model → ${getModel(id).name}`);
  }, [activeId, updateSession, toast]);

  const onResetSettings = useCallback(() => {
    setSettings((s) => ({ ...DEFAULT_SETTINGS, theme: s.theme }));
    toast("Parameters reset to defaults");
  }, [toast]);

  const closeSide = useCallback(() => setSideOpen(false), []);
  const closeSettings = useCallback(() => setSetOpen(false), []);
  const closeWorkspace = useCallback(() => setWsOpen(false), []);
  const closeModel = useCallback(() => setModelOpen(false), []);
  const openSettings = useCallback(() => setSetOpen(true), []);
  const openWorkspace = useCallback(() => setWsOpen(true), []);
  const openImageLab = useCallback(() => setView("image"), []);

  const onComposerSend = useCallback(() => {
    const t = input.trim();
    if (t.startsWith("/image")) { setInput(""); setView("image"); }
    else if (t.startsWith("/video")) { setInput(""); setView("video"); }
    else if (t.startsWith("/speech") || t.startsWith("/voice")) { setInput(""); setView("audio"); }
    else if (t.startsWith("/clear")) { setInput(""); newChat(); }
    else send();
  }, [input, newChat, send]);

  const composerCaps = useMemo(
    () => ({ vision: model.caps.vision, webSearch: model.caps.webSearch, reasoning: model.caps.reasoning }),
    [model],
  );
  const composerFlags = useMemo(
    () => ({
      web: settings.enableWebSearch, tools: settings.enableFunctions,
      test: settings.testMode, stream: settings.stream,
    }),
    [settings.enableWebSearch, settings.enableFunctions, settings.testMode, settings.stream],
  );

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "never"}>
      <div
        className="flex h-[100dvh] overflow-hidden bg-[var(--color-canvas)] text-[var(--color-ink)]"
        style={{ fontSize: settings.fontSize }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { touchStart.current = null; }}
      >
        <LeftSidebar
          open={sideOpen} onClose={closeSide}
          sessions={sessions} activeId={activeId}
          onSelect={onSelectSession}
          onNew={newChat}
          onDelete={onDeleteSession}
          onPin={onPinSession}
          onRename={onRenameSession}
          view={view} setView={setView}
          onOpenSettings={openSettings} onOpenWorkspace={openWorkspace}
          authed={authed} user={user} onAuth={doAuth} usage={usage} puterOk={puterOk}
        />

        {/* ══════════════════ MAIN ══════════════════ */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* top bar */}
          <header className="glass safe-t z-30 flex shrink-0 items-center gap-1.5 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/85 px-2.5 py-2">
            <button
              onClick={() => setSideOpen(true)}
              aria-label="Open sidebar"
              className="press grid h-9 w-9 place-items-center rounded-xl text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] lg:hidden"
            >
              <Menu size={18} />
            </button>

            {view === "chat" ? (
              <>
                <ModelTrigger model={model} onClick={() => setModelOpen(true)} />
                <div className="ml-1 hidden items-center gap-1.5 md:flex">
                  {model.caps.reasoning && <Chip tone="violet"><Brain size={10} /> reasoning</Chip>}
                  {settings.enableWebSearch && model.caps.webSearch && <Chip tone="amber">web</Chip>}
                  {settings.testMode && <Chip tone="amber">test mode</Chip>}
                  {settings.compaction && <Chip tone="blue">compaction</Chip>}
                </div>
                <span className="mx-1 hidden font-mono text-[10.5px] tabular-nums text-[var(--color-ink-3)] sm:block">
                  {(sessToks.total / 1000).toFixed(1)}k / {(model.context / 1000).toFixed(0)}k
                </span>
              </>
            ) : (
              <p className="text-[14px] font-bold tracking-tight">
                {NAV.find((n) => n.v === view)?.label}
              </p>
            )}

            <span className="flex-1" />

            {puterOk === false && (
              <button onClick={doAuth} className="press">
                <Chip tone="red"><CircleAlert size={10} /> puter blocked</Chip>
              </button>
            )}

            {view === "chat" && (
              <span className="hidden items-center gap-0.5 sm:flex">
                <IconBtn title="Export .md" onClick={() => exportChat("md")}><Download size={16} /></IconBtn>
                <IconBtn title="New chat" onClick={newChat}><Plus size={17} /></IconBtn>
                <IconBtn title="Workspace" onClick={() => setWsOpen(true)} active={wsOpen}><FolderOpen size={16} /></IconBtn>
                <IconBtn title="Parameters" onClick={() => setSetOpen(true)} active={setOpen}><Settings2 size={16} /></IconBtn>
              </span>
            )}
            <span className="sm:hidden">
              <IconBtn title="New chat" onClick={newChat}><Plus size={18} /></IconBtn>
            </span>
          </header>

          {/* context meter */}
          {view === "chat" && active && active.messages.length > 0 && settings.showTokens && (
            <div className="hidden shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-4 py-1.5 text-[10.5px] text-[var(--color-ink-3)] sm:flex">
              <Zap size={11} />
              <span>context {ctxPct.toFixed(1)}% · in {(sessToks.inp / 1000).toFixed(1)}k · out {(sessToks.out / 1000).toFixed(1)}k</span>
              <div className="w-24">
                <Meter value={sessToks.total} max={model.context}
                  tone={ctxPct > 85 ? "bg-red-500" : ctxPct > 60 ? "bg-amber-500" : undefined} />
              </div>
              {settings.compaction && <span>· compaction @ {(settings.compactionThreshold / 1000).toFixed(0)}k</span>}
              {settings.enableCache && <span className="text-emerald-500">· cache on</span>}
              {settings.provider && <span className="font-mono">· via {settings.provider}</span>}
            </div>
          )}

          {/* content */}
          {view !== "chat" ? (
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {view === "image" && <ImageLab onToast={toast} />}
              {view === "video" && <VideoLab onToast={toast} />}
              {view === "audio" && <VoiceLab onToast={toast} />}
              {view === "gallery" && <Gallery onToast={toast} />}
            </div>
          ) : showEmpty ? (
            <Welcome
              authed={authed}
              liveCount={liveModels.length}
              modelName={model.name}
              onAuth={doAuth}
              onPick={(s) => {
                if (s.image) setView("image");
                else if ((s as any).tts) setView("audio");
                else { setInput(s.prompt); setTimeout(() => taRef.current?.focus(), 60); }
              }}
            />
          ) : (
            <div ref={scrollRef} onScroll={onScroll} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className={cn("mx-auto w-full max-w-3xl px-4 pb-8 pt-5", densityGap)}>
                {active && (
                  <MessageList
                    messages={active.messages}
                    settings={settings}
                    model={model}
                    streaming={streaming}
                    copiedId={copiedId}
                    onCopy={onCopyMsg}
                    onEdit={onEditMsg}
                    onDelete={onDeleteMsg}
                    onSpeak={speak}
                    onRegen={regen}
                  />
                )}

                {streaming && (
                  <StreamingBlock
                    model={model}
                    showThinking={settings.showThinking}
                    showTools={settings.showTools}
                    streamText={streamText}
                    streamReason={streamReason}
                    streamTools={streamTools}
                    streamImages={streamImages}
                  />
                )}
              </div>

              <ScrollToBottom show={!atBottom} onClick={jumpToBottom} />
            </div>
          )}

          {/* composer */}
          {view === "chat" && (
            <div className="hairline-t">
              <Composer
                input={input} setInput={setInput}
                onSend={onComposerSend}
                onStop={stop}
                streaming={streaming}
                attachments={attachments} setAttachments={setAttachments}
                modelName={model.name}
                listening={listening} onMic={toggleMic}
                onOpenSettings={openSettings}
                onOpenWorkspace={openWorkspace}
                onGenerateImage={openImageLab}
                estTokens={estInput} wsCount={wsAttached} toolCount={toolCount}
                caps={composerCaps}
                flags={composerFlags}
                onPickFiles={onPickFiles}
                taRef={taRef}
                enterToSend={settings.enterToSend}
              />
            </div>
          )}

          {/* mobile tab bar */}
          <nav className="hairline-t safe-b flex shrink-0 items-stretch justify-around bg-[var(--color-canvas)] pb-1 pt-1 lg:hidden">
            {NAV.map((n) => {
              const on = view === n.v;
              return (
                <button
                  key={n.v}
                  onClick={() => setView(n.v)}
                  className={cn(
                    "press relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[9.5px] font-medium tracking-tight transition-colors",
                    on ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]",
                  )}
                >
                  {n.icon}
                  <span>{n.short}</span>
                  {on && (
                    <motion.span
                      layoutId="tabbar-dot"
                      className="absolute -top-px h-[2px] w-7 rounded-full bg-[var(--color-brand)]"
                      transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ══════════════════ overlays ══════════════════ */}
        <SettingsDrawer
          open={setOpen} onClose={closeSettings}
          settings={settings} onChange={setSettings}
          liveCount={liveModels.length} providers={providers}
          onReset={onResetSettings}
        />
        <WorkspaceDrawer
          open={wsOpen} onClose={closeWorkspace}
          files={workspace} onChange={setWorkspace} onToast={toast}
        />
        <ModelPicker
          open={modelOpen} onClose={closeModel}
          value={settings.model}
          onChange={onPickModel}
          liveModels={liveModels}
        />

        <Sheet
          open={confirmClear}
          onClose={() => setConfirmClear(false)}
          side="center"
          width={400}
          title="Erase all local data?"
          icon={<Trash2 size={16} className="text-red-500" />}
          footer={
            <div className="flex gap-2">
              <Btn variant="secondary" className="flex-1" onClick={() => setConfirmClear(false)}>Keep</Btn>
              <Btn
                variant="danger" className="flex-1"
                onClick={() => {
                  store.clearAll();
                  setSessions([]); setWorkspace([]);
                  setUsage({ in: 0, out: 0, calls: 0 });
                  setConfirmClear(false);
                  newChat();
                  toast("All local data cleared");
                }}
              >
                Erase everything
              </Btn>
            </div>
          }
        >
          <p className="px-4 py-4 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            Chats, workspace files, gallery and usage stats will be deleted from this device.
            This cannot be undone.
          </p>
        </Sheet>

        {/* toasts */}
        <div className="pointer-events-none fixed bottom-[calc(5.5rem+var(--safe-b))] left-1/2 z-[120] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className={cn(
                  "pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium shadow-[0_14px_40px_-12px_rgba(0,0,0,.6)]",
                  t.tone === "err"
                    ? "bg-red-600 text-white"
                    : "bg-[var(--color-brand)] text-[var(--color-brand-ink)]",
                )}
              >
                <Zap size={13} className="shrink-0" />
                <span className="truncate">{t.msg}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}

/* ═══════════════════════════ WELCOME ═══════════════════════════ */

function Welcome({
  authed, liveCount, modelName, onAuth, onPick,
}: {
  authed: boolean; liveCount: number; modelName: string;
  onAuth: () => void; onPick: (s: (typeof PROMPT_STARTERS)[number]) => void;
}) {
  return (
    <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
      {/* aurora wash */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora -left-24 -top-24 h-72 w-72 bg-violet-500/25" style={{ animationDelay: "0s" }} />
        <div className="aurora -right-20 top-10 h-64 w-64 bg-sky-500/20" style={{ animationDelay: "-5s" }} />
        <div className="aurora bottom-0 left-1/3 h-56 w-56 bg-fuchsia-500/15" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, type: "spring", stiffness: 420, damping: 26 }}
            className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[18px] bg-[var(--color-brand)] text-[var(--color-brand-ink)] shadow-[0_16px_44px_-14px_rgba(0,0,0,.6)]"
          >
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path d="M9 9l14 14M23 9L9 23" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <circle cx="16" cy="16" r="3.4" fill="currentColor" />
            </svg>
          </motion.div>

          <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-.035em] sm:text-[42px]">
            What should we
            <br />
            <span className="shimmer-text">explore today?</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {MODEL_CATALOG.length}+ curated models through Puter.js
            {liveCount > 0 ? ` · ${liveCount} live detected` : " · connect for the live catalog"}.
            Everything stays on this device.
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {PROMPT_STARTERS.map((s, i) => (
            <motion.button
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.045, type: "spring", stiffness: 380, damping: 30 }}
              onClick={() => onPick(s)}
              className="press group rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3.5 text-left hover:border-[var(--color-line-2)] hover:bg-[var(--color-panel-2)]"
            >
              <span className="text-[17px] leading-none">{s.icon}</span>
              <p className="mt-2 text-[13px] font-semibold tracking-tight">{s.title}</p>
              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
                {s.prompt.slice(0, 78)}…
              </p>
            </motion.button>
          ))}
        </div>

        {!authed && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, type: "spring", stiffness: 380, damping: 30 }}
            onClick={onAuth}
            className="press mx-auto mt-5 flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-[12.5px] font-semibold hover:bg-[var(--color-panel-2)]"
          >
            <Sparkles size={13} /> Connect Puter to start chatting — free, no API keys
          </motion.button>
        )}

        <p className="mt-6 text-center text-[11px] text-[var(--color-ink-3)]">
          Chatting with <b className="font-semibold text-[var(--color-ink-2)]">{modelName}</b> · press{" "}
          <kbd className="rounded border border-[var(--color-line)] px-1 font-mono text-[10px]">⌘K</kbd> to switch
        </p>
      </div>
    </div>
  );
}
