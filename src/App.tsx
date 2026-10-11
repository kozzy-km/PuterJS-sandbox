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
  store, uid, timeAgo, sessionTokens, PROMPT_STARTERS, DEFAULT_SETTINGS,
  fontStack, codeStack,
  type ChatSession, type ChatMessage, type Attachment,
  type WorkspaceFile, type AppSettings, type ToolCallRecord, fileToDataUrl,
} from "./lib/store";
import { expandZip, toWorkspaceFile } from "./lib/files";
import { LeftSidebar, SettingsDrawer, WorkspaceDrawer, NAV, type NavView } from "./components/Sidebars";
import { ImageLab, VideoLab, VoiceLab } from "./components/StudioViews";
import { Gallery } from "./components/Gallery";
import {
  Md, Thinking, ToolTray, TypingDots, AttachmentThumbs, ErrorCard,
  MsgActions, ScrollToBottom, ImageResult,
} from "./components/ChatView";
import { Composer } from "./components/Composer";
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
      description: "Search the user's attached workspace files; returns short snippets.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
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

  /* ── local tools ──────────────────────────────────────────────── */
  const runLocalTool = useCallback(async (name: string, args: any): Promise<string> => {
    if (name === "calculator") return safeCalc(String(args?.expression ?? ""));
    if (name === "get_datetime") {
      const d = new Date();
      return `${d.toString()}\nISO: ${d.toISOString()}\nTZ offset: ${-d.getTimezoneOffset() / 60}h`;
    }
    if (name === "workspace_lookup") {
      const q = String(args?.query ?? "").toLowerCase();
      const hits: string[] = [];
      workspace.filter((f) => f.attach).forEach((f) => {
        if (f.kind === "image" || hits.length >= 4) return;
        const idx = f.content.toLowerCase().indexOf(q);
        if (q && idx >= 0) hits.push(`### ${f.name}\n…${f.content.slice(Math.max(0, idx - 160), idx + 480)}…`);
        else if (!q) hits.push(`### ${f.name}\n${f.content.slice(0, 400)}`);
      });
      return hits.length ? hits.join("\n\n").slice(0, 3500) : "No matches in attached workspace files.";
    }
    if (name === "workspace_write") {
      const fname = String(args?.name ?? "").trim();
      const content = String(args?.content ?? "");
      if (!fname) return "workspace_write error: name is required";
      if (content.length > 120000) return "workspace_write error: content over 120k chars";
      const mode = args?.mode === "append" ? "append" : "replace";
      let wrote: WorkspaceFile | null = null;
      setWorkspace((prev) => {
        const i = prev.findIndex((f) => f.name.toLowerCase() === fname.toLowerCase());
        const nextContent = mode === "append" && i >= 0 ? prev[i].content + "\n" + content : content;
        wrote = {
          id: i >= 0 ? prev[i].id : uid(),
          name: fname, kind: "doc", content: nextContent,
          size: nextContent.length, updatedAt: Date.now(), attach: i >= 0 ? prev[i].attach : true,
        };
        const w = wrote as WorkspaceFile;
        return i >= 0 ? prev.map((f, k) => (k === i ? w : f)) : [w, ...prev];
      });
      toast(`${mode === "append" ? "Appended to" : "Saved"} ${fname} in workspace`);
      return `OK — ${mode === "append" ? "appended to" : "wrote"} ${fname} (${content.length} chars). It is now in the user's workspace${mode === "replace" ? " and attached as context" : ""}.`;
    }
    if (name === "fetch_url_text") {
      try {
        const r = await fetch(String(args.url), { signal: AbortSignal.timeout(12000) });
        const t = await r.text();
        return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, Math.min(Number(args?.max_chars) || 4000, 8000));
      } catch (e: any) {
        return "fetch failed: " + (e?.message || e);
      }
    }
    return `unknown tool: ${name}`;
  }, [workspace, toast]);

  const buildTools = useCallback(() => {
    const tools: any[] = [];
    if (settings.enableWebSearch && model.caps.webSearch) tools.push({ type: "web_search" });
    if (settings.enableFunctions) {
      const fns = [...LOCAL_TOOLS];
      if (!settings.enableWebSearch) {
        const i = fns.findIndex((t: any) => t.function.name === "fetch_url_text");
        if (i >= 0) fns.splice(i, 1);
      }
      tools.push(...fns);
    }
    return tools;
  }, [settings.enableWebSearch, settings.enableFunctions, model.caps.webSearch]);

  /**
   * History builder. Honours Puter's compaction contract: if an earlier turn
   * produced a compaction artifact, that artifact stands in for everything
   * before it, so we restart the window there instead of resending it all.
   */
  const buildMessages = useCallback((sess: ChatSession, userText: string, atts: Attachment[]) => {
    const attached = settings.enableWorkspace ? workspace.filter((f) => f.attach && f.kind !== "image") : [];
    const wsImages = settings.enableWorkspace ? workspace.filter((f) => f.attach && f.kind === "image").slice(0, 3) : [];

    let sys = settings.systemPrompt;
    if (attached.length) {
      // Budgeted: the AI can always pull more with workspace_lookup.
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

    const usable = sess.messages.filter((m) => m.role !== "system" && !m.error);

    // Restart after the newest compaction artifact — it replaces the older turns.
    let start = 0;
    for (let i = usable.length - 1; i >= 0; i--) {
      if (usable[i].role === "assistant" && usable[i].compaction) { start = i; break; }
    }

    const hist: any[] = usable.slice(start, start + 24).map((m, idx) => {
      // Tool results are the biggest context hog in long chats: the UI keeps
      // the full text, but history resends a trimmed digest.
      if (m.isToolResult) {
        return { ...m, content: String((m as any).content ?? m.text ?? "").slice(0, 1500) };
      }

      if (m.role === "assistant") {
        const out: any = { role: "assistant", content: m.text || "" };
        // A compaction artifact is carried as the FIRST block of the assistant
        // turn that produced it, standing in for everything summarised before.
        if (idx === 0 && m.compaction) {
          out.content = m.text
            ? [m.compaction, { type: "text", text: m.text }]
            : [m.compaction];
        }
        if (m.toolCalls?.length) {
          out.tool_calls = m.toolCalls.map((t) => ({
            id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) },
          }));
        }
        return out;
      }
      return { role: m.role, content: m.text };
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
  }, [settings.systemPrompt, settings.enableWorkspace, settings.enableCache, settings.model, workspace, model.vendor]);

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
    const text = (override ?? input).trim();
    if ((!text && attachments.length === 0) || streaming) return;

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
      attachments: attachments.length ? [...attachments] : undefined,
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
      const { msgs } = buildMessages(convoBase, enrichedText, userMsg.attachments || []);
      const opts = buildOpts(tools);

      let conversation: any[] = [...msgs];
      let finalText = "", finalReason = "";
      const allTools: ToolCallRecord[] = [];
      const finalImages: string[] = [];
      let compaction: any = null;
      let inTok = estimateTokens(JSON.stringify(conversation)), outTok = 0;

      for (let turn = 0; turn < 5; turn++) {
        if (abortRef.current) break;

        if (effectiveStream) {
          let turnText = "", turnReason = "";
          const pendingTools: any[] = [];
          const resp = await callChat(puter, conversation, opts, true);
          streamRef.current = resp;

          for await (const part of resp) {
            if (abortRef.current) break;
            if (!part) continue;
            if (part.type === "error" || part.error) {
              throw new Error(part.message || part.error || "stream error");
            }
            const t = chunkText(part);
            if (t) { turnText += t; setStreamText(finalText + turnText); }

            const r = chunkReasoning(part);
            if (r) { turnReason += r; setStreamReason(finalReason + turnReason); }

            // Streamed image chunks — without this, image models showed nothing.
            const img = chunkImage(part);
            if (img && !finalImages.includes(img)) {
              finalImages.push(img);
              setStreamImages([...finalImages]);
            }

            if (part.type === "compaction" || part.compaction) compaction = part.compaction || part;

            const tc = part.tool_calls || part.toolCalls || (part.type === "tool_use" ? [part] : null);
            if (Array.isArray(tc) && tc.length) pendingTools.push(...tc);
            else if (part.type === "tool_use" && (part.name || part.id)) pendingTools.push(part);
            if (part.message?.tool_calls?.length) pendingTools.push(...part.message.tool_calls);
          }

          finalText += turnText;
          finalReason += turnReason;
          outTok += estimateTokens(turnText + turnReason);

          if (!pendingTools.length) break;
          if (pendingTools.every((t) => (t?.function?.name || t?.name) === "web_search")) break;

          const turnRecs: ToolCallRecord[] = [];
          for (const raw of pendingTools) {
            const name = raw?.function?.name || raw?.name || "tool";
            if (name === "web_search") continue; // executed upstream natively
            let args: any = {};
            try {
              args = typeof raw?.function?.arguments === "string"
                ? JSON.parse(raw.function.arguments)
                : raw?.input || raw?.args || {};
            } catch { args = {}; }
            const t0 = performance.now();
            const result = await runLocalTool(name, args);
            const rec: ToolCallRecord = {
              id: raw?.id || uid(), name, args,
              result: String(result).slice(0, 4000),
              ms: Math.round(performance.now() - t0), status: "ok",
            };
            turnRecs.push(rec);
            allTools.push(rec);
            setStreamTools([...allTools]);
          }

          if (turnRecs.length) {
            conversation = [
              ...conversation,
              {
                role: "assistant",
                content: turnText || "",
                tool_calls: turnRecs.map((r) => ({
                  id: r.id, type: "function",
                  function: { name: r.name, arguments: JSON.stringify(r.args) },
                })),
              },
              ...turnRecs.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.result })),
            ];
          }
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
          finalText += (finalText ? "\n" : "") + piece;
          setStreamText(finalText);

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
            outTok = res.usage.completion_tokens || res.usage.output_tokens || estimateTokens(finalText);
          } else {
            outTok = estimateTokens(finalText);
          }

          const tcs: any[] = msg?.tool_calls || msg?.toolCalls || res?.tool_calls || [];
          if (!tcs.length) break;

          for (const raw of tcs) {
            const name = raw?.function?.name || raw?.name;
            if (name === "web_search" || !name) continue;
            let args: any = {};
            try { args = JSON.parse(raw.function.arguments); } catch { args = {}; }
            const t0 = performance.now();
            const result = await runLocalTool(name, args);
            allTools.push({
              id: raw.id || uid(), name, args,
              result: String(result).slice(0, 6000),
              ms: Math.round(performance.now() - t0), status: "ok",
            });
            setStreamTools([...allTools]);
          }
          conversation = [
            ...conversation,
            msg,
            ...allTools.slice(-4).map((t) => ({ role: "tool", tool_call_id: t.id, content: t.result })),
          ];
        }
      }

      if (!finalText && !finalImages.length && model.caps.imageGen) {
        finalText = "(the image model returned no text — check the gallery or retry)";
      }

      const assistant: ChatMessage = {
        id: uid(), role: "assistant", text: finalText || "—",
        reasoning: finalReason || undefined,
        images: finalImages.length ? finalImages : undefined,
        toolCalls: allTools.length ? allTools : undefined,
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
    input, attachments, streaming, activeId, settings, buildTools, buildMessages,
    buildOpts, callChat, effectiveStream, runLocalTool, updateSession, model.caps.imageGen, toast,
  ]);

  const stop = () => {
    abortRef.current = true;
    streamRef.current?.return?.();
    setStreaming(false);
  };

  const regen = () => {
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
  };

  /* ── voice input ───────────────────────────────────────────────── */
  const toggleMic = () => {
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
  };

  const speak = async (text: string) => {
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
  };

  const onPickFiles = async (files: FileList | null, kind: "image" | "file" | "audio") => {
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
      setWorkspace((prev) => [...items.map((i) => toWorkspaceFile(i)), ...prev]);
      toast(`Unzipped ${items.length} file${items.length > 1 ? "s" : ""} from ${z.name} → workspace`);
    }
  };

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

  /* ── autoscroll (only while pinned to the bottom) ──────────────── */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
  };
  useEffect(() => {
    if (!atBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, streamText, streamReason, streamImages.length, atBottom]);
  useEffect(() => { setAtBottom(true); }, [activeId]);
  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

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
          open={sideOpen} onClose={() => setSideOpen(false)}
          sessions={sessions} activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            const s = sessionsRef.current.find((x) => x.id === id);
            if (s?.model) setSettings((prev) => ({ ...prev, model: s.model }));
          }}
          onNew={newChat}
          onDelete={(id) => {
            const remaining = sessionsRef.current.filter((s) => s.id !== id);
            setSessions(remaining);
            sessionsRef.current = remaining;
            if (activeId === id) setActiveId(remaining[0]?.id ?? null);
            toast("Chat deleted");
          }}
          onPin={(id) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))}
          onRename={(id, t) => setSessions((p) => p.map((s) => (s.id === id ? { ...s, title: t } : s)))}
          view={view} setView={setView}
          onOpenSettings={() => setSetOpen(true)} onOpenWorkspace={() => setWsOpen(true)}
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
                {active?.messages.map((m, i) => {
                  const isLast = i === active.messages.length - 1;
                  const msgModel = m.model ? getModel(m.model) : model;

                  if (m.role === "user") {
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 34 }}
                        className="group flex flex-col items-end"
                      >
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mb-1.5"><AttachmentThumbs atts={m.attachments} /></div>
                        )}
                        <div className="max-w-[86%] rounded-[20px] rounded-br-[7px] bg-[var(--color-panel-2)] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-[75%]">
                          {m.text}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--color-ink-3)]">{timeAgo(m.ts)}</span>
                          <MsgActions
                            m={m} copied={copiedId === m.id} isLast={false}
                            onCopy={() => { navigator.clipboard.writeText(m.text).catch(() => {}); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1300); }}
                            onEdit={() => {
                              setInput(m.text);
                              updateSession(active.id, (s) => ({ ...s, messages: s.messages.filter((x) => x.id !== m.id) }));
                              setTimeout(() => taRef.current?.focus(), 60);
                            }}
                            onDelete={() => updateSession(active.id, (s) => ({ ...s, messages: s.messages.filter((x) => x.id !== m.id) }))}
                          />
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                      className="group"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[9.5px] font-bold text-white"
                          style={{ background: msgModel.color === "#e5e5e5" || msgModel.color === "#d4d4d8" ? "#3f3f46" : msgModel.color }}
                        >
                          {msgModel.name[0] ?? "N"}
                        </span>
                        <span className="truncate text-[11.5px] font-medium text-[var(--color-ink-3)]">
                          {msgModel.name} · {timeAgo(m.ts)}
                        </span>
                        {m.usage && settings.showTokens && (
                          <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-3)]">
                            ↑{m.usage.in} ↓{m.usage.out}
                          </span>
                        )}
                      </div>

                      {m.error ? <ErrorCard msg={m.error} /> : (
                        <div className="space-y-1">
                          {settings.showThinking && m.reasoning && <Thinking text={m.reasoning} />}
                          {settings.showTools && m.toolCalls?.length ? <ToolTray tools={m.toolCalls} /> : null}
                          {m.text && m.text !== "—" && <Md text={m.text} />}
                          {m.images?.map((src, k) => <ImageResult key={k} src={src} alt="generated" />)}
                        </div>
                      )}

                      {!m.error && (
                        <div className="mt-1">
                          <MsgActions
                            m={m} copied={copiedId === m.id} isLast={isLast && !streaming}
                            onCopy={() => { navigator.clipboard.writeText(m.text).catch(() => {}); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1300); }}
                            onSpeak={() => speak(m.text)}
                            onRegen={regen}
                          />
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {streaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className="grid h-5 w-5 shrink-0 animate-pulse place-items-center rounded-md text-[9.5px] font-bold text-white"
                        style={{ background: model.color === "#e5e5e5" || model.color === "#d4d4d8" ? "#3f3f46" : model.color }}
                      >
                        {model.name[0]}
                      </span>
                      <span className="text-[11.5px] font-medium text-[var(--color-ink-3)]">{model.name} is thinking…</span>
                    </div>
                    <div className="space-y-1">
                      {settings.showThinking && streamReason && <Thinking text={streamReason} streaming />}
                      {settings.showTools && streamTools.length > 0 && <ToolTray tools={streamTools} streaming />}
                      {streamImages.map((src, k) => <ImageResult key={k} src={src} alt="generating" />)}
                      {streamText ? <Md text={streamText} caret /> : <TypingDots />}
                    </div>
                  </motion.div>
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
                onSend={() => {
                  const t = input.trim();
                  if (t.startsWith("/image")) { setInput(""); setView("image"); }
                  else if (t.startsWith("/video")) { setInput(""); setView("video"); }
                  else if (t.startsWith("/speech") || t.startsWith("/voice")) { setInput(""); setView("audio"); }
                  else if (t.startsWith("/clear")) { setInput(""); newChat(); }
                  else send();
                }}
                onStop={stop}
                streaming={streaming}
                attachments={attachments} setAttachments={setAttachments}
                modelName={model.name}
                listening={listening} onMic={toggleMic}
                onOpenSettings={() => setSetOpen(true)}
                onOpenWorkspace={() => setWsOpen(true)}
                onGenerateImage={() => setView("image")}
                estTokens={estInput} wsCount={wsAttached} toolCount={toolCount}
                caps={{ vision: model.caps.vision, webSearch: model.caps.webSearch, reasoning: model.caps.reasoning }}
                flags={{
                  web: settings.enableWebSearch,
                  tools: settings.enableFunctions,
                  test: settings.testMode,
                  stream: settings.stream,
                }}
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
          open={setOpen} onClose={() => setSetOpen(false)}
          settings={settings} onChange={setSettings}
          liveCount={liveModels.length} providers={providers}
          onReset={() => {
            setSettings({ ...DEFAULT_SETTINGS, theme: settings.theme });
            toast("Parameters reset to defaults");
          }}
        />
        <WorkspaceDrawer
          open={wsOpen} onClose={() => setWsOpen(false)}
          files={workspace} onChange={setWorkspace} onToast={toast}
        />
        <ModelPicker
          open={modelOpen} onClose={() => setModelOpen(false)}
          value={settings.model}
          onChange={(id) => {
            setSettings((s) => ({ ...s, model: id }));
            if (active) updateSession(active.id, (s) => ({ ...s, model: id }));
            toast(`Model → ${getModel(id).name}`);
          }}
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
