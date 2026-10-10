import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Plus, Pin, PinOff, Trash2, Image as ImageIcon, Clapperboard,
  AudioLines, MessageSquare, Settings2, FolderOpen, FileText, Paperclip,
  Download, Upload, Sun, Moon, LayoutGrid, Check, Pencil,
} from "lucide-react";
import type { ChatSession, WorkspaceFile, AppSettings } from "../lib/store";
import {
  timeAgo, sessionTokens, SYSTEM_PRESETS, store, uid,
  fileToDataUrl, UI_FONTS, CODE_FONTS,
} from "../lib/store";
import {
  MODEL_CATALOG, getModel, checkParams, IMAGE_MODELS, VIDEO_MODELS, TTS_PRESETS,
} from "../lib/puter";
import { Field, Seg, Slider, Toggle, Chip, Meter, Select, Section, Btn, Sheet, useMediaQuery } from "./ui";
import { cn } from "../utils/cn";

export type NavView = "chat" | "image" | "video" | "audio" | "gallery";

export const NAV: { v: NavView; label: string; short: string; icon: React.ReactNode }[] = [
  { v: "chat",    label: "Chat",       short: "Chat",   icon: <MessageSquare size={16} /> },
  { v: "image",   label: "Image Lab",  short: "Image",  icon: <ImageIcon size={16} /> },
  { v: "video",   label: "Video Lab",  short: "Video",  icon: <Clapperboard size={16} /> },
  { v: "audio",   label: "Voice & OCR", short: "Voice", icon: <AudioLines size={16} /> },
  { v: "gallery", label: "Gallery",    short: "Gallery", icon: <LayoutGrid size={16} /> },
];

const BrandMark = ({ size = 30 }: { size?: number }) => (
  <span
    className="grid shrink-0 place-items-center rounded-[11px] bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
    style={{ width: size, height: size }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 32 32" fill="none">
      <path d="M9 9l14 14M23 9L9 23" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
    </svg>
  </span>
);

/* ═════════════════════════════ LEFT SIDEBAR ═════════════════════════════ */

export function LeftSidebar(p: {
  open: boolean; onClose: () => void;
  sessions: ChatSession[]; activeId: string | null;
  onSelect: (id: string) => void; onNew: () => void;
  onDelete: (id: string) => void; onPin: (id: string) => void; onRename: (id: string, t: string) => void;
  view: NavView; setView: (v: NavView) => void;
  onOpenSettings: () => void; onOpenWorkspace: () => void;
  authed: boolean; user: any; onAuth: () => void;
  usage: { in: number; out: number; calls: number };
  puterOk: boolean | null;
}) {
  const instanceId = useId();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [et, setEt] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) renameRef.current?.select(); }, [editing]);

  const filtered = useMemo(() => {
    const list = [...p.sessions].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt,
    );
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        s.messages.some((m) => m.text.toLowerCase().includes(needle)),
    );
  }, [p.sessions, q]);

  const commitRename = (id: string, fallback: string) => {
    const next = et.trim();
    if (next && next !== fallback) p.onRename(id, next);
    setEditing(null);
    setEt("");
  };

  const ChatRow = ({ s }: { s: ChatSession }) => {
    const active = s.id === p.activeId;
    const t = sessionTokens(s);
    return (
      <div
        onClick={() => { p.onSelect(s.id); p.setView("chat"); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") { p.onSelect(s.id); p.setView("chat"); } }}
        className={cn(
          "group relative flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors",
          active
            ? "bg-[var(--color-panel-2)] ring-1 ring-[var(--color-line)]"
            : "hover:bg-[var(--color-panel-2)]",
        )}
      >
        {active && (
          <motion.span
            layoutId={`sidebar-active-${instanceId}`}
            className="absolute inset-y-2 left-0 w-[2.5px] rounded-r-full bg-[var(--color-brand)]"
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
          />
        )}
        <div className="flex items-center gap-1.5">
          {s.pinned && <Pin size={11} className="shrink-0 text-amber-500" />}
          {editing === s.id ? (
            <input
              ref={renameRef}
              autoFocus
              value={et}
              onChange={(e) => setEt(e.target.value)}
              onBlur={() => commitRename(s.id, s.title)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(s.id, s.title);
                if (e.key === "Escape") { setEditing(null); setEt(""); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-md border border-[var(--color-line-2)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-[13px] outline-none"
            />
          ) : (
            <p
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(s.id); setEt(s.title); }}
              className="min-w-0 flex-1 truncate text-[13.2px] font-medium tracking-tight"
            >
              {s.title}
            </p>
          )}
          {/* Row actions — always visible on touch, hover-revealed with a mouse. */}
          <span className="row-actions flex shrink-0 items-center gap-0.5">
            <button
              title={s.pinned ? "Unpin" : "Pin chat"}
              aria-label={s.pinned ? "Unpin chat" : "Pin chat"}
              onClick={(e) => { e.stopPropagation(); p.onPin(s.id); }}
              className="press grid h-6 w-6 place-items-center rounded-md text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-amber-500"
            >
              {s.pinned ? <PinOff size={12.5} /> : <Pin size={12.5} />}
            </button>
            <button
              title="Rename chat"
              aria-label="Rename chat"
              onClick={(e) => { e.stopPropagation(); setEditing(s.id); setEt(s.title); }}
              className="press grid h-6 w-6 place-items-center rounded-md text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
            >
              <Pencil size={12.5} />
            </button>
            <button
              title="Delete chat"
              aria-label="Delete chat"
              onClick={(e) => { e.stopPropagation(); p.onDelete(s.id); }}
              className="press grid h-6 w-6 place-items-center rounded-md text-[var(--color-ink-3)] hover:bg-red-500/12 hover:text-red-500"
            >
              <Trash2 size={12.5} />
            </button>
          </span>
        </div>
        <p className="truncate text-[11px] text-[var(--color-ink-3)]">
          {timeAgo(s.updatedAt)} · {getModel(s.model).name} · {(t.total / 1000).toFixed(1)}k tok
        </p>
      </div>
    );
  };

  const body = (
    <div className="flex h-full flex-col">
      {/* brand */}
      <div className="flex items-center gap-2.5 px-4 pb-1 pt-[max(1rem,var(--safe-t))]">
        <BrandMark size={32} />
        <div className="min-w-0 leading-tight">
          <p className="text-[14px] font-bold tracking-[-.02em]">NEXUS</p>
          <p className="truncate text-[10.5px] text-[var(--color-ink-3)]">local-first · puter.js</p>
        </div>
        <button
          onClick={p.onClose}
          aria-label="Close sidebar"
          className="press ml-auto grid h-8 w-8 place-items-center rounded-lg text-[var(--color-ink-3)] hover:bg-[var(--color-panel-2)] lg:hidden"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      {/* new chat + search */}
      <div className="px-3 pt-3">
        <button
          onClick={p.onNew}
          className="press flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand)] py-2.5 text-[13px] font-semibold tracking-tight text-[var(--color-brand-ink)]"
        >
          <Plus size={15} strokeWidth={2.6} /> New chat
        </button>
        <div className="relative mt-2">
          <Search size={13.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search chats"
            className="w-full rounded-xl border border-transparent bg-[var(--color-panel-2)] py-2 pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-line-2)]"
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* nav — a 5-up rail reads as an app tab bar rather than a web menu */}
      <div className="grid grid-cols-5 gap-0.5 px-3 pt-2.5">
        {NAV.map((n) => {
          const active = p.view === n.v;
          return (
            <button
              key={n.v}
              onClick={() => { p.setView(n.v); p.onClose(); }}
              title={n.label}
              className={cn(
                "press relative flex flex-col items-center gap-1 rounded-xl py-2 text-[9.5px] font-medium tracking-tight transition-colors",
                active
                  ? "bg-[var(--color-panel-2)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink-2)]",
              )}
            >
              {n.icon}
              <span className="truncate">{n.short}</span>
              {active && (
                <motion.span
                  layoutId={`nav-underline-${instanceId}`}
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-[var(--color-brand)]"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* chat list */}
      <div className="scroll-thin mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            {q.trim() ? "No chats match that search." : "No conversations yet.\nStart one above."}
          </p>
        )}
        {filtered.map((s) => <ChatRow key={s.id} s={s} />)}
      </div>

      {/* footer */}
      <div className="shrink-0 space-y-2 border-t border-[var(--color-line)] p-3">
        <div className="rounded-xl bg-[var(--color-panel-2)] p-3">
          <div className="flex justify-between text-[10.5px] font-medium text-[var(--color-ink-2)]">
            <span>Lifetime tokens</span>
            <span className="tabular-nums">{((p.usage.in + p.usage.out) / 1000).toFixed(1)}k · {p.usage.calls} calls</span>
          </div>
          <div className="mt-2"><Meter value={p.usage.in + p.usage.out} max={500000} /></div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={p.onOpenWorkspace}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
          >
            <FolderOpen size={13} /> Files
          </button>
          <button
            onClick={p.onOpenSettings}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
          >
            <Settings2 size={13} /> Params
          </button>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(p.sessions, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "nexus-chats.json";
              a.click();
            }}
            className="press flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 hover:text-[var(--color-ink)]"
          >
            <Download size={11} /> Export
          </button>
          <label className="press flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 hover:text-[var(--color-ink)]">
            <Upload size={11} /> Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  try {
                    const arr = JSON.parse(r.result as string);
                    if (Array.isArray(arr)) {
                      store.sessions = [...arr, ...store.sessions].slice(0, 200);
                      location.reload();
                    }
                  } catch { /* ignore malformed import */ }
                };
                r.readAsText(f);
              }}
            />
          </label>
          <span className="flex-1 py-1.5 text-center font-mono text-[10px] opacity-70">local-only</span>
        </div>
        <button
          onClick={p.onAuth}
          className={cn(
            "press flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold tracking-tight",
            p.authed
              ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-[var(--color-brand)] text-[var(--color-brand-ink)]",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              p.puterOk === false ? "bg-red-500" : p.authed ? "bg-emerald-500" : "bg-amber-400",
            )}
          />
          <span className="truncate">
            {p.puterOk === false
              ? "Puter blocked — tap to retry"
              : p.authed
                ? p.user?.username || p.user?.email || "Puter connected"
                : "Connect Puter (free credits)"}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden h-full w-[268px] shrink-0 border-r border-[var(--color-line)] bg-[var(--color-panel)] lg:block">
        {body}
      </aside>

      <AnimatePresence>
        {p.open && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={p.onClose}
              className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 38, mass: 0.9 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.5, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x < -70 || info.velocity.x < -480) p.onClose(); }}
              className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[310px] flex-col border-r border-[var(--color-line)] bg-[var(--color-panel)] shadow-[0_0_60px_rgba(0,0,0,.6)]"
            >
              {body}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════ SETTINGS DRAWER ═══════════════════════════ */

const SentDot = ({ ok }: { ok: boolean }) => (
  <span className={cn("font-mono text-[10.5px]", ok ? "text-emerald-500" : "text-amber-500")}>
    {ok ? "● sent" : "○ ignored"}
  </span>
);

export function SettingsDrawer({
  open, onClose, settings, onChange, liveCount, providers, onReset,
}: {
  open: boolean; onClose: () => void;
  settings: AppSettings; onChange: (s: AppSettings) => void;
  liveCount: number; providers: string[]; onReset: () => void;
}) {
  const set = (k: Partial<AppSettings>) => onChange({ ...settings, ...k });
  const checks = checkParams(settings.model, { reasoning_effort: settings.reasoning_effort, temperature: settings.temperature });
  const m = getModel(settings.model);

  const modelOptions = useMemo(() => {
    const groups = new Map<string, { value: string; label: string; hint?: string; group?: string }[]>();
    MODEL_CATALOG.forEach((x) => {
      const g = x.family;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({
        value: x.id, label: x.name,
        hint: `${x.tagline} · ${(x.context / 1000).toFixed(0)}k`,
        group: g,
      });
    });
    return [...groups.entries()].flatMap(([g, items]) => items.map((i) => ({ ...i, group: g })));
  }, []);

  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      title="Parameters"
      subtitle={`${m.family} · ${liveCount > 0 ? `${liveCount} live models` : m.vendor}`}
      icon={<Settings2 size={16} />}
      footer={
        <div className="flex gap-2">
          <Btn variant="secondary" size="md" className="flex-1" onClick={onClose}>Done</Btn>
          <Btn variant="ghost" size="md" onClick={onReset}>Reset</Btn>
        </div>
      }
    >
      <div className="space-y-3 p-3.5">
        <Section title="Model" badge={<Chip tone="zinc">{m.vendor}</Chip>}>
          <Field
            label="Model"
            hint={`${m.tagline} · ctx ${(m.context / 1000).toFixed(0)}k · out ${(m.maxOut / 1000).toFixed(0)}k`}
          >
            <Select value={settings.model} onChange={(v) => set({ model: v })} options={modelOptions} searchable />
          </Field>
          <div className="flex flex-wrap gap-1">
            {m.caps.vision && <Chip tone="green">vision</Chip>}
            {m.caps.reasoning && <Chip tone="violet">reasoning</Chip>}
            {m.caps.tools && <Chip tone="blue">tools</Chip>}
            {m.caps.webSearch && <Chip tone="amber">web_search</Chip>}
            {m.caps.imageGen && <Chip tone="violet">image-gen</Chip>}
            {m.caps.thinkingExtended && <Chip>thinking</Chip>}
            {m.caps.videoUnderstand && <Chip>video</Chip>}
            {!checks.temperature.ok && <Chip tone="amber">no-temp</Chip>}
          </div>
        </Section>

        <Section title="System prompt">
          <Field label="Persona">
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5 text-[12.8px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
            />
            <div className="flex flex-wrap gap-1 pt-1.5">
              {SYSTEM_PRESETS.map((pr) => (
                <button
                  key={pr.name}
                  onClick={() => set({ systemPrompt: pr.prompt })}
                  className="press rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[10.5px] font-medium hover:border-[var(--color-line-2)] hover:bg-[var(--color-panel-2)]"
                >
                  {pr.name}
                </button>
              ))}
            </div>
            {settings.enableCache && m.vendor === "anthropic" && (
              <p className="text-[11.5px] text-emerald-500">✓ prompt-caching on (cache_control: ephemeral)</p>
            )}
          </Field>
        </Section>

        <Section title="Sampling">
          <Field
            label={`Temperature · ${settings.temperature.toFixed(2)}`}
            right={<SentDot ok={checks.temperature.ok} />}
            warn={!checks.temperature.ok ? checks.temperature.note : undefined}
            hint={checks.temperature.ok ? checks.temperature.note : undefined}
          >
            <Slider value={settings.temperature} min={0} max={2} step={0.05} onChange={(v) => set({ temperature: v })} disabled={!checks.temperature.ok} />
          </Field>
          <Field label={`Max tokens · ${settings.max_tokens}`} hint={`Model cap ${(m.maxOut / 1000).toFixed(0)}k`}>
            <Slider value={settings.max_tokens} min={256} max={Math.min(128000, m.maxOut)} step={256} onChange={(v) => set({ max_tokens: Math.round(v) })} />
          </Field>
          <Field label="Stop sequences" hint="Comma-separated, e.g. ###, END">
            <input
              value={settings.stopSequences}
              onChange={(e) => set({ stopSequences: e.target.value })}
              placeholder="###, END"
              className="w-full rounded-xl border border-[var(--color-line)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-line-2)]"
            />
          </Field>
        </Section>

        <Section title="Reasoning & verbosity">
          <Field
            label="Reasoning effort"
            right={<SentDot ok={checks.reasoning_effort.ok} />}
            warn={!checks.reasoning_effort.ok ? checks.reasoning_effort.note : undefined}
          >
            <Seg size="sm" value={settings.reasoning_effort} onChange={(v: any) => set({ reasoning_effort: v })}
              options={["none", "minimal", "low", "medium", "high", "xhigh"].map((v) => ({ v: v as any, label: v }))} />
          </Field>
          <Field label="Verbosity" right={<SentDot ok={checks.verbosity.ok} />} warn={!checks.verbosity.ok ? checks.verbosity.note : undefined}>
            <Seg value={settings.verbosity} onChange={(v: any) => set({ verbosity: v })}
              options={["low", "medium", "high"].map((v) => ({ v: v as any, label: v }))} />
          </Field>
          <Field
            label="Extended thinking (Claude)"
            right={<SentDot ok={checks.thinking.ok} />}
            warn={!checks.thinking.ok ? checks.thinking.note : undefined}
          >
            <Seg size="sm" value={settings.thinkingType} onChange={(v: any) => set({ thinkingType: v })}
              options={[{ v: "adaptive", label: "adaptive" }, { v: "enabled", label: "enabled" }, { v: "disabled", label: "off" }, { v: "between_tools", label: "btwn tools" }] as any} />
            {settings.thinkingType === "enabled" && (
              <div className="pt-1">
                <Slider value={settings.thinkingBudget} min={1024} max={32000} step={512} onChange={(v) => set({ thinkingBudget: Math.round(v) })} />
                <p className="font-mono text-[11px] text-[var(--color-ink-3)]">budget {settings.thinkingBudget} tokens</p>
              </div>
            )}
          </Field>
        </Section>

        <Section title="Image output" defaultOpen={m.caps.imageGen}>
          <Field label="Applies when" hint={checks.image_config.note}>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Aspect ratio" value={settings.imageAspect} onChange={(v) => set({ imageAspect: v })}
                options={["1:1", "16:9", "9:16", "4:3", "3:4", "5:4", "4:5", "21:9"].map((r) => ({ value: r, label: r }))} />
              <Select label="Image size" value={settings.imageSize} onChange={(v) => set({ imageSize: v })}
                options={["512", "1K", "2K", "4K"].map((r) => ({ value: r, label: r }))} />
            </div>
          </Field>
        </Section>

        <Section title="Tools for AI">
          {[
            { k: "enableWebSearch" as const, t: "Web search (native)", d: m.caps.webSearch ? "tools:[{type:'web_search'}]" : "OpenAI-only natively — auto-mapped to fetch tool", warn: !checks.web_search.ok },
            { k: "enableFunctions" as const, t: "Local functions", d: "calculator · datetime · workspace · fetch", warn: false },
            { k: "enableWorkspace" as const, t: "Workspace files as context", d: "Attached files injected into the system prompt", warn: false },
            { k: "enableCache" as const, t: "Prompt caching (Claude)", d: "cache_control ephemeral", warn: false },
          ].map((r) => (
            <div key={r.k} className="flex items-center gap-3">
              <Toggle on={(settings as any)[r.k]} onChange={(v) => set({ [r.k]: v } as any)} label={r.t} />
              <div className="min-w-0 leading-tight">
                <p className="text-[13px] font-medium">
                  {r.t} {r.warn && <span className="text-[10px] text-amber-500">· emulated</span>}
                </p>
                <p className="truncate font-mono text-[10.5px] text-[var(--color-ink-3)]">{r.d}</p>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="tool_choice">
              <Seg size="sm" value={settings.toolChoice} onChange={(v: any) => set({ toolChoice: v })}
                options={[{ v: "auto" as const, label: "auto" }, { v: "none" as const, label: "none" }, { v: "required" as const, label: "required" }]} />
            </Field>
            <div className="flex items-end gap-2 pb-1.5">
              <Toggle on={settings.parallelTools} onChange={(v) => set({ parallelTools: v })} label="Parallel tool calls" />
              <span className="text-[12.5px]">parallel calls</span>
            </div>
          </div>
          <Field label="Structured output (JSON schema)" hint="outputFormat: { type:'json_schema', … }">
            <div className="flex items-center gap-2.5">
              <Toggle on={settings.jsonMode} onChange={(v) => set({ jsonMode: v })} label="Constrain to schema" />
              <span className="text-[12.5px] text-[var(--color-ink-3)]">constrain to schema</span>
            </div>
            {settings.jsonMode && (
              <textarea
                value={settings.jsonSchema}
                onChange={(e) => set({ jsonSchema: e.target.value })}
                rows={4}
                spellCheck={false}
                className="mt-2 w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5 font-mono text-[11.5px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
              />
            )}
          </Field>
        </Section>

        <Section title="Behaviour & transport">
          {[
            { k: "stream" as const, t: "Stream responses", d: "token-by-token + reasoning chunks" },
            { k: "compaction" as const, t: "Context compaction", d: `trigger @ ${(settings.compactionThreshold / 1000).toFixed(0)}k tokens` },
            { k: "testMode" as const, t: "Test mode (no credits)", d: "sample outputs, validates params" },
          ].map((r) => (
            <div key={r.k} className="flex items-center gap-3">
              <Toggle on={(settings as any)[r.k]} onChange={(v) => set({ [r.k]: v } as any)} label={r.t} />
              <div className="min-w-0 leading-tight">
                <p className="text-[13px] font-medium">{r.t}</p>
                <p className="truncate font-mono text-[10.5px] text-[var(--color-ink-3)]">{r.d}</p>
              </div>
            </div>
          ))}
          {settings.compaction && (
            <Slider value={settings.compactionThreshold} min={8000} max={200000} step={4000} onChange={(v) => set({ compactionThreshold: Math.round(v) })} />
          )}
          <Field label="normalize" hint="true = OpenAI shape · false = vendor-native · auto = release-date rule">
            <Seg size="sm"
              value={settings.normalize === null ? "auto" : settings.normalize ? "on" : "off"}
              onChange={(v: any) => set({ normalize: v === "auto" ? null : v === "on" })}
              options={[{ v: "auto", label: "auto" }, { v: "on", label: "force on" }, { v: "off", label: "force off" }]} />
          </Field>
          <Field label="Pinned provider" hint="Blank lets Puter pick the best vendor per request">
            <Select
              value={settings.provider || "__auto"}
              onChange={(v) => set({ provider: v === "__auto" ? "" : v })}
              options={[
                { value: "__auto", label: "Auto (Puter routes)", hint: "recommended" },
                ...providers.map((p) => ({ value: p, label: p })),
              ]}
              searchable={providers.length > 8}
            />
          </Field>
        </Section>

        <Section title="Studio defaults" defaultOpen={false}>
          <Field label="Image model">
            <Select value={settings.imgModel} onChange={(v) => set({ imgModel: v })}
              options={IMAGE_MODELS.map((x) => ({ value: x.id, label: x.name, hint: x.desc }))} searchable />
          </Field>
          <Field label="Video model">
            <Select value={settings.vidModel} onChange={(v) => set({ vidModel: v })}
              options={VIDEO_MODELS.map((x) => ({ value: x.id, label: x.name, hint: x.desc }))} searchable />
          </Field>
          <Field label="TTS provider">
            <Select value={settings.ttsProvider} onChange={(v) => set({ ttsProvider: v })}
              options={TTS_PRESETS.map((x) => ({ value: x.provider, label: x.name }))} />
          </Field>
        </Section>

        <Section title="Appearance">
          <div className="flex items-center gap-2">
            <button
              onClick={() => set({ theme: "dark" })}
              className={cn(
                "press flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[12.5px] font-medium",
                settings.theme === "dark"
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
                  : "border-[var(--color-line)] hover:bg-[var(--color-panel-2)]",
              )}
            >
              <Moon size={13} /> Dark
            </button>
            <button
              onClick={() => set({ theme: "light" })}
              className={cn(
                "press flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[12.5px] font-medium",
                settings.theme === "light"
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
                  : "border-[var(--color-line)] hover:bg-[var(--color-panel-2)]",
              )}
            >
              <Sun size={13} /> Light
            </button>
          </div>

          <Field label="Interface font">
            <Select value={settings.uiFont} onChange={(v) => set({ uiFont: v as any })}
              options={UI_FONTS.map((f) => ({ value: f.id, label: f.label }))} />
          </Field>
          <Field label="Code font">
            <Select value={settings.codeFont} onChange={(v) => set({ codeFont: v as any })}
              options={CODE_FONTS.map((f) => ({ value: f.id, label: f.label }))} />
          </Field>
          <Field label={`Text size · ${settings.fontSize.toFixed(1)}px`}>
            <Slider value={settings.fontSize} min={12} max={19} step={0.5} onChange={(v) => set({ fontSize: v })} />
          </Field>
          <Field label="Spacing">
            <Seg value={settings.density} onChange={(v: any) => set({ density: v })}
              options={[{ v: "cozy" as const, label: "Cozy" }, { v: "compact" as const, label: "Compact" }]} />
          </Field>

          {[
            { k: "reduceMotion" as const, t: "Reduce motion" },
            { k: "showThinking" as const, t: "Show thinking blocks" },
            { k: "showTools" as const, t: "Show tool calls" },
            { k: "showTokens" as const, t: "Show token counts" },
            { k: "enterToSend" as const, t: "Enter to send (⇧↵ newline)" },
          ].map((r) => (
            <div key={r.k} className="flex items-center gap-3">
              <Toggle on={(settings as any)[r.k]} onChange={(v) => set({ [r.k]: v } as any)} label={r.t} />
              <span className="text-[13px]">{r.t}</span>
            </div>
          ))}

          <div className="rounded-xl bg-[var(--color-panel-2)] p-3 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
            <p className="mb-1.5 font-semibold uppercase tracking-[.08em] text-[var(--color-ink-3)] text-[10px]">Shortcuts</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
              <span>⌘K</span><span>model picker</span>
              <span>⌘⇧O</span><span>new chat</span>
              <span>⌘/</span><span>parameters</span>
              <span>⌘B</span><span>toggle sidebar</span>
              <span>Esc</span><span>close overlay</span>
            </div>
          </div>
        </Section>
      </div>
    </SheetFrame>
  );
}

/* Shared shell so both right-hand panels behave identically. */
function SheetFrame({
  open, onClose, title, subtitle, icon, children, footer,
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: string;
  icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const isPhone = useMediaQuery("(max-width: 767px)");

  if (isPhone) {
    return (
      <Sheet open={open} onClose={onClose} side="bottom" title={title} subtitle={subtitle} icon={icon} footer={footer}>
        {children}
      </Sheet>
    );
  }
  return (
    <Sheet open={open} onClose={onClose} side="right" width={416} title={title} subtitle={subtitle} icon={icon} footer={footer}>
      {children}
    </Sheet>
  );
}

export { Sheet };

/* ═════════════════════════ WORKSPACE DRAWER ═════════════════════════ */

export function WorkspaceDrawer({
  open, onClose, files, onChange, onToast,
}: {
  open: boolean; onClose: () => void;
  files: WorkspaceFile[]; onChange: (f: WorkspaceFile[]) => void;
  onToast: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const add = () => {
    if (!name.trim() && !content.trim()) return;
    onChange([
      {
        id: uid(), name: name.trim() || `note-${files.length + 1}.md`,
        kind: "note", content, size: content.length, updatedAt: Date.now(), attach: true,
      },
      ...files,
    ]);
    setName(""); setContent(""); onToast("File added to workspace");
  };

  const importFile = async (f: File) => {
    if (f.type.startsWith("image/")) {
      onChange([{ id: uid(), name: f.name, kind: "image", content: await fileToDataUrl(f), size: f.size, updatedAt: Date.now(), attach: true }, ...files]);
    } else {
      const t = await f.text().catch(() => "");
      onChange([{ id: uid(), name: f.name, kind: "doc", content: t.slice(0, 60000), size: f.size, updatedAt: Date.now(), attach: true }, ...files]);
    }
    onToast("Imported " + f.name);
  };

  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      title="Workspace"
      subtitle={`${files.filter((f) => f.attach).length} of ${files.length} attached as context`}
      icon={<FolderOpen size={16} />}
    >
      <div className="space-y-3 p-3.5">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.11em] text-[var(--color-ink-3)]">New note</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name.md"
            className="mb-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 text-[13px] outline-none focus:border-[var(--color-line-2)]"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Paste docs, context, style guide… the AI reads attached files."
            className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 text-[12.8px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
          />
          <div className="mt-2 flex gap-2">
            <Btn size="sm" className="flex-1" onClick={add}><Plus size={13} /> Add</Btn>
            <label className="press flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-[var(--color-line)] text-[12.5px] font-semibold hover:bg-[var(--color-panel)]">
              <Upload size={13} /> Import
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { Array.from(e.target.files || []).forEach(importFile); e.target.value = ""; }}
              />
            </label>
          </div>
        </div>

        {files.length === 0 && (
          <p className="py-10 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            No files yet.<br />Add notes or import docs — attached files become AI context.
          </p>
        )}

        {files.map((f) => (
          <div key={f.id} className="rounded-2xl border border-[var(--color-line)] p-3">
            <div className="flex items-center gap-2">
              {f.kind === "image" ? <ImageIcon size={14} /> : f.attach ? <Paperclip size={14} /> : <FileText size={14} />}
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.name}</p>
              <Toggle on={f.attach} onChange={(v) => onChange(files.map((x) => (x.id === f.id ? { ...x, attach: v } : x)))} label={`Attach ${f.name}`} />
            </div>
            {f.kind === "image" ? (
              <img src={f.content} className="mt-2 max-h-40 w-full rounded-xl object-cover" alt={f.name} />
            ) : (
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--color-ink-3)]">
                {f.content.slice(0, 400)}
              </p>
            )}
            <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--color-ink-3)]">
              <span>{(f.size / 1024).toFixed(1)} KB · {timeAgo(f.updatedAt)}</span>
              <span className="ml-auto flex items-center gap-3">
                <button onClick={() => { navigator.clipboard.writeText(f.content).catch(() => {}); onToast("Copied"); }} className="press hover:text-[var(--color-ink)]">copy</button>
                <button
                  onClick={() => {
                    const blob = new Blob([f.content], { type: "text/plain" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = f.name;
                    a.click();
                  }}
                  className="press flex items-center gap-1 hover:text-[var(--color-ink)]"
                >
                  <Download size={11} /> save
                </button>
                <button onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="press text-red-400 hover:text-red-500">delete</button>
              </span>
            </div>
          </div>
        ))}

        {files.length > 0 && (
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "nexus-workspace.json";
              a.click();
            }}
            className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
          >
            <Download size={12} /> Export workspace JSON
          </button>
        )}
      </div>
    </SheetFrame>
  );
}

export { SYSTEM_PRESETS as _SP };
export const CheckIcon = Check;
export const TrashIcon = Trash2;
