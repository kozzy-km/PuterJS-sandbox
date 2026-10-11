import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Plus, Pin, PinOff, Trash2, Image as ImageIcon, Clapperboard,
  AudioLines, MessageSquare, Settings2, FolderOpen, FileText,
  Download, Upload, Sun, Moon, LayoutGrid, Check, Pencil, ChevronDown,
  MoreVertical, SquarePen, ChevronsLeft, Zap, Bot, Brain, Wrench, Thermometer,
} from "lucide-react";
import type { ChatSession, WorkspaceFile, AppSettings } from "../lib/store";
import {
  timeAgo, SYSTEM_PRESETS, uid,
  UI_FONTS, CODE_FONTS,
} from "../lib/store";
import {
  MODEL_CATALOG, getModel, checkParams, IMAGE_MODELS, VIDEO_MODELS, TTS_PRESETS,
} from "../lib/puter";
import { readFileForWorkspace, toWorkspaceFile, fmtBytes } from "../lib/files";
import { Field, Seg, Slider, Toggle, Chip, Select, Section, Btn, Sheet, useMediaQuery, GroupLabel } from "./ui";
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

const LeftSidebarImpl = function LeftSidebar(p: {
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

  /* Grok-style kebab menu + collapsible conversation list */
  const [menuId, setMenuId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-chat-menu]")) setMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId]);

  const exportChats = () => {
    const blob = new Blob([JSON.stringify(p.sessions, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-chats.json";
    a.click();
  };

  const MenuItem = ({ children, icon, onClick, danger }: {
    children: ReactNode; icon: ReactNode; onClick: () => void; danger?: boolean;
  }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium",
        danger
          ? "text-red-400 hover:bg-red-500/12 hover:text-red-500"
          : "text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]",
      )}
    >
      {icon}{children}
    </button>
  );

  const ChatRow = ({ s }: { s: ChatSession }) => {
    const active = s.id === p.activeId;
    const select = () => { p.onSelect(s.id); p.setView("chat"); };
    return (
      <div
        onClick={select}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") select(); }}
        className={cn(
          "group relative flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors",
          active ? "bg-[var(--color-panel-2)]" : "hover:bg-[var(--color-panel-2)]",
        )}
      >
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
            className="min-w-0 flex-1 rounded-md border border-[var(--color-line-2)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-[13px] outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5">
              {s.pinned && <Pin size={10.5} className="shrink-0 text-amber-500" />}
              <span className={cn(
                "truncate text-[13px] font-medium tracking-tight",
                active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-2)]",
              )}>
                {s.title}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[10.5px] text-[var(--color-ink-3)]">
              {timeAgo(s.updatedAt)} · {getModel(s.model).name}
            </span>
          </span>
        )}
        <span className="relative shrink-0" data-chat-menu>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}
            aria-label={`Actions for ${s.title}`}
            className="press grid h-7 w-7 place-items-center rounded-lg text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            <MoreVertical size={14} />
          </button>
          <AnimatePresence>
            {menuId === s.id && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-8 z-40 w-36 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-float)] p-1 shadow-[0_18px_50px_-16px_rgba(0,0,0,.65)]"
              >
                <MenuItem onClick={() => { p.onPin(s.id); setMenuId(null); }} icon={s.pinned ? <PinOff size={13} /> : <Pin size={13} />}>
                  {s.pinned ? "Unpin" : "Pin"}
                </MenuItem>
                <MenuItem onClick={() => { setEditing(s.id); setEt(s.title); setMenuId(null); }} icon={<Pencil size={13} />}>
                  Rename
                </MenuItem>
                <MenuItem danger onClick={() => { p.onDelete(s.id); setMenuId(null); }} icon={<Trash2 size={13} />}>
                  Delete
                </MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </span>
      </div>
    );
  };

  const body = (
    <div className="flex h-full flex-col">
      {/* header — brand mark + round collapse, Grok profile-row style */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,var(--safe-t))]">
        <BrandMark size={38} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-bold tracking-[-.02em]">NEXUS</p>
          <p className="truncate text-[11px] text-[var(--color-ink-3)]">local-first · puter.js</p>
        </div>
        <button
          onClick={p.onClose}
          aria-label="Close sidebar"
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-panel-2)] text-[var(--color-ink-2)] lg:hidden"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {/* views — one rounded card with hairline-separated rows */}
        <div className="overflow-hidden rounded-2xl bg-[var(--color-panel-2)]">
          {NAV.map((n, i) => {
            const active = p.view === n.v;
            return (
              <button
                key={n.v}
                onClick={() => { p.setView(n.v); p.onClose(); }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  i > 0 && "border-t border-[var(--color-line)]",
                  active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]",
                )}
              >
                <span className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                  active ? "bg-[var(--color-panel)] text-[var(--color-ink)]" : "text-[var(--color-ink-3)]",
                )}>
                  {n.icon}
                </span>
                <span className="flex-1 truncate text-[13px] font-medium tracking-tight">{n.label}</span>
                {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-cta)]" />}
              </button>
            );
          })}
        </div>

        {/* Puter banner — Grok's blue promo card doubles as the connect CTA */}
        <button
          onClick={p.onAuth}
          className="mt-2 flex w-full items-center gap-3 rounded-[22px] bg-[var(--color-cta)] px-3.5 py-3 text-left text-white shadow-[0_14px_40px_-16px_rgba(29,111,242,.8)]"
        >
          <Zap size={17} className="shrink-0" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12.5px] font-semibold">
              {p.puterOk === false
                ? "Puter blocked — tap to retry"
                : p.authed
                  ? p.user?.username || p.user?.email || "Puter connected"
                  : "Connect Puter · free credits"}
            </span>
            <span className="block truncate text-[10.5px] text-white/70">
              {p.authed ? "signed in · your cloud credits" : "no API keys · pay-per-use via puter.js"}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-white/40 px-2.5 py-1 text-[10.5px] font-semibold">
            {p.authed ? "Account" : "Connect"}
          </span>
        </button>

        {/* conversations */}
        <div className="flex items-center gap-2 px-1.5 pb-1 pt-4">
          <p className="flex-1 text-[11.5px] font-medium text-[var(--color-ink-3)]">Conversations</p>
          <button
            onClick={() => setListOpen((v) => !v)}
            aria-label="Toggle conversation list"
            className="press grid h-6 w-6 place-items-center rounded-md text-[var(--color-ink-3)]"
          >
            <ChevronDown size={13} className={cn("transition-transform duration-200", !listOpen && "-rotate-90")} />
          </button>
        </div>

        {listOpen && (
          <div className="space-y-0.5">
            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
                {q.trim() ? "No chats match that search." : "No conversations yet."}
              </p>
            )}
            {filtered.map((s) => <ChatRow key={s.id} s={s} />)}
          </div>
        )}
      </div>

      {/* Grok bottom bar — search pill + round actions */}
      <div className="shrink-0 border-t border-[var(--color-line)] p-3 pb-[max(0.75rem,var(--safe-b))]">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label="Search chats"
              className="w-full rounded-full bg-[var(--color-panel-2)] py-2.5 pr-3 text-[12.5px] outline-none placeholder:text-[var(--color-ink-3)]"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            onClick={p.onOpenWorkspace}
            title="Workspace files"
            aria-label="Workspace files"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
          >
            <FolderOpen size={16} />
          </button>
          <button
            onClick={p.onOpenSettings}
            title="Parameters"
            aria-label="Parameters"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={p.onNew}
            title="New chat"
            aria-label="New chat"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-cta)] text-white"
          >
            <SquarePen size={16} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[var(--color-ink-3)]">
          <span className="tabular-nums">{((p.usage.in + p.usage.out) / 1000).toFixed(1)}k tokens · {p.usage.calls} calls</span>
          <button onClick={exportChats} className="press hover:text-[var(--color-ink-2)]">export chats</button>
        </div>
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

;
/* ═══════════════════════════ SETTINGS DRAWER ═══════════════════════════ */

const SentDot = ({ ok }: { ok: boolean }) => (
  <span className={cn("font-mono text-[10.5px]", ok ? "text-emerald-500" : "text-amber-500")}>
    {ok ? "● sent" : "○ ignored"}
  </span>
);

const SettingsDrawerImpl = function SettingsDrawer({
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
      title="Settings"
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
        <GroupLabel>Model & output</GroupLabel>
        <Section title="Model" icon={<Bot size={15} />} sub={m.name} badge={<Chip tone="zinc">{m.vendor}</Chip>}>
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

        <Section title="System prompt" icon={<MessageSquare size={15} />} sub="instructions · identity" defaultOpen={false}>
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

        <Section title="Sampling" icon={<Thermometer size={15} />} sub="temperature · top-p" defaultOpen={false}>
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

        <Section title="Reasoning & verbosity" icon={<Brain size={15} />} sub="thinking effort" defaultOpen={false}>
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
                <p className="font-mono text-[11px] text-[var(--color-ink-3)]">budget {settings.thinkingBudget} tokens (legacy — prefer adaptive + effort)</p>
              </div>
            )}
          </Field>
          <Field
            label="Thinking effort (Anthropic)"
            hint={checks.effort.note}
            right={<SentDot ok={checks.effort.ok} />}
          >
            <Seg size="sm" value={settings.thinkingEffort} onChange={(v: any) => set({ thinkingEffort: v })}
              options={[{ v: "low", label: "low" }, { v: "medium", label: "med" }, { v: "high", label: "high" }, { v: "max", label: "max" }] as any} />
          </Field>
        </Section>

        <Section title="Image output" icon={<ImageIcon size={15} />} sub="size · quality" defaultOpen={false}>
          <Field label="Applies when" hint={checks.image_config.note}>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Aspect ratio" value={settings.imageAspect} onChange={(v) => set({ imageAspect: v })}
                options={["1:1", "16:9", "9:16", "4:3", "3:4", "5:4", "4:5", "21:9"].map((r) => ({ value: r, label: r }))} />
              <Select label="Image size" value={settings.imageSize} onChange={(v) => set({ imageSize: v })}
                options={["512", "1K", "2K", "4K"].map((r) => ({ value: r, label: r }))} />
            </div>
          </Field>
        </Section>

        <GroupLabel>Capabilities</GroupLabel>
        <Section title="Tools for AI" icon={<Wrench size={15} />} sub="built-in tools · context budget" defaultOpen={false}>
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

        <GroupLabel>App</GroupLabel>
        <Section title="Behaviour & transport" icon={<Settings2 size={15} />} sub="system · stream · retry" defaultOpen={false}>
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

        <Section title="Studio defaults" icon={<Clapperboard size={15} />} sub="video · audio" defaultOpen={false}>
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

        <Section title="Appearance" icon={<Sun size={15} />} sub="theme · fonts">
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

;
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

const WorkspaceDrawerImpl = function WorkspaceDrawer({
  open, onClose, files, onChange, onToast,
}: {
  open: boolean; onClose: () => void;
  files: WorkspaceFile[]; onChange: (f: WorkspaceFile[]) => void;
  onToast: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [noteName, setNoteName] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? files.filter((f) => f.name.toLowerCase().includes(needle)) : files;
  }, [files, q]);

  const patch = (id: string, p: Partial<WorkspaceFile>) =>
    onChange(files.map((f) => (f.id === id ? { ...f, ...p, updatedAt: Date.now() } : f)));

  const addNote = () => {
    if (!noteName.trim() && !noteBody.trim()) return;
    const body = noteBody;
    onChange([
      { id: uid(), name: noteName.trim() || `note-${files.length + 1}.md`, kind: "doc", content: body, size: body.length, updatedAt: Date.now(), attach: true },
      ...files,
    ]);
    setNoteName(""); setNoteBody(""); setComposing(false);
    onToast("Note added to workspace");
  };

  /** Imports any files; `.zip` archives are extracted entry-by-entry. */
  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const added: WorkspaceFile[] = [];
    let zipped = 0;
    for (const f of Array.from(list).slice(0, 40)) {
      const items = await readFileForWorkspace(f);
      if (/\.zip$/i.test(f.name)) zipped += items.length;
      items.forEach((i) => added.push(toWorkspaceFile(i)));
    }
    if (added.length) {
      onChange([...added, ...files]);
      onToast(zipped ? `Imported ${added.length} files (${zipped} from zips)` : `Imported ${added.length} file${added.length > 1 ? "s" : ""}`);
    } else onToast("Nothing importable in that file", );
    setBusy(false);
  };

  const download = (f: WorkspaceFile) => {
    const isData = f.content.startsWith("data:");
    const a = document.createElement("a");
    a.href = isData ? f.content : URL.createObjectURL(new Blob([f.content], { type: "text/plain" }));
    a.download = f.name;
    a.click();
  };

  const iconFor = (f: WorkspaceFile) =>
    f.kind === "image" ? <ImageIcon size={15} /> : f.kind === "audio" ? <AudioLines size={15} /> : <FileText size={15} />;

  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      title="Workspace"
      subtitle={`${files.filter((f) => f.attach).length} of ${files.length} attached as context`}
      icon={<FolderOpen size={16} />}
    >
      <div className="space-y-2.5 p-3.5">
        {/* toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files"
              className="w-full rounded-full border border-transparent bg-[var(--color-panel-2)] py-2 pl-8.5 pr-3 text-[12.5px] outline-none transition-colors focus:border-[var(--color-line-2)]"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <label
            className={cn(
              "press grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]",
              busy && "pointer-events-none opacity-50",
            )}
            title="Import files or a .zip"
          >
            {busy ? <span className="animate-spin"><Upload size={15} /></span> : <Upload size={15} />}
            <input type="file" multiple className="hidden" onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button
            onClick={() => setComposing((v) => !v)}
            title="New note"
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-cta)] text-white"
          >
            <Plus size={16} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {composing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.21, 0.9, 0.35, 1] }}
              className="overflow-hidden rounded-2xl bg-[var(--color-panel-2)]"
            >
              <div className="space-y-2 p-3">
                <input
                  value={noteName}
                  onChange={(e) => setNoteName(e.target.value)}
                  placeholder="name.md"
                  className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 text-[13px] outline-none focus:border-[var(--color-line-2)]"
                />
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={4}
                  placeholder="Paste docs, context, style guide… attached files become AI context."
                  className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 text-[12.8px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
                />
                <Btn size="sm" className="w-full" onClick={addNote}><Plus size={13} /> Add note</Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {files.length === 0 && (
          <p className="py-10 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            No files yet.<br />Import docs, images or a .zip — attached files become AI context,<br />and the AI can write back with <span className="font-mono text-[11.5px]">workspace_write</span>.
          </p>
        )}
        {files.length > 0 && shown.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-[var(--color-ink-3)]">No file matches “{q}”.</p>
        )}

        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {shown.map((f) => {
              const expanded = openId === f.id;
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="overflow-hidden rounded-2xl bg-[var(--color-panel-2)]"
                >
                  <div className="flex items-center gap-2.5 py-2.5 pl-3 pr-2.5">
                    <button
                      onClick={() => setOpenId(expanded ? null : f.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--color-panel)] text-[var(--color-ink-2)]">
                        {iconFor(f)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium tracking-tight">{f.name}</span>
                        <span className="block truncate text-[10.5px] text-[var(--color-ink-3)]">
                          {fmtBytes(f.size)} · {timeAgo(f.updatedAt)}{f.attach ? "" : " · not attached"}
                        </span>
                      </span>
                      <ChevronDown size={14} className={cn("shrink-0 text-[var(--color-ink-3)] transition-transform duration-200", expanded && "rotate-180")} />
                    </button>
                    <Toggle on={f.attach} onChange={(v) => patch(f.id, { attach: v })} label={`Attach ${f.name}`} />
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.21, 0.9, 0.35, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-[var(--color-line)] p-2.5">
                          {f.kind === "image" ? (
                            <img src={f.content} className="max-h-48 w-full rounded-xl object-cover" alt={f.name} />
                          ) : f.kind === "audio" ? (
                            <audio src={f.content} controls className="w-full" />
                          ) : (
                            <textarea
                              value={f.content}
                              onChange={(e) => patch(f.id, { content: e.target.value, size: e.target.value.length })}
                              rows={9}
                              spellCheck={false}
                              className="scroll-thin w-full resize-y rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 font-mono text-[11.5px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
                            />
                          )}
                          <div className="mt-2 flex items-center gap-1">
                            <button onClick={() => { navigator.clipboard.writeText(f.content).catch(() => {}); onToast("Copied"); }} className="press rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]">copy</button>
                            <button onClick={() => download(f)} className="press flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"><Download size={11} /> save</button>
                            <button onClick={() => { onChange(files.filter((x) => x.id !== f.id)); onToast(`Deleted ${f.name}`); }} className="press ml-auto rounded-lg px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/12 hover:text-red-500">delete</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {files.length > 0 && (
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "nexus-workspace.json";
              a.click();
            }}
            className="press flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
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

/* Memoised exports — App re-renders on every keystroke / stream chunk; these
   panels rebuild thousands of elements each time unless their props are
   stable (all handlers passed by App are useCallback'd). */
export const LeftSidebar = memo(LeftSidebarImpl);
export const SettingsDrawer = memo(SettingsDrawerImpl);
export const WorkspaceDrawer = memo(WorkspaceDrawerImpl);
