import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { highlight } from "../lib/highlight";
import {
  Brain, Wrench, Copy, Check, Volume2, ChevronRight, AlertTriangle,
  Image as ImageIcon, RefreshCw, Pencil, Trash2, ArrowDown, FileText,
} from "lucide-react";
import type { Attachment, ChatMessage } from "../lib/store";
import { cn } from "../utils/cn";

/* ═══════════════════════════ code block ═══════════════════════════ */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  return (
    <Reveal>
      <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-line)] bg-[#08080a]">
        <div className="codeblock-head">
          <span className="truncate uppercase tracking-[.08em]">{lang || "code"}</span>
          <button
            onClick={copy}
            className="press flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#9c9ca6] hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="!m-0 !rounded-none !border-0">
          <code className="hl" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </Reveal>
  );
}

/* ═══════════════════ ChatGPT-style block reveal ═══════════════════
   Every top-level markdown block fades / slides / de-blurs in once, when it
   first mounts (i.e. when the stream completes that block). Completed blocks
   keep their identity across re-renders, so streaming text never replays the
   animation and there is no typewriter effect. */

function Reveal({ children }: { children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 9, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Wraps a markdown block tag in the reveal animation. */
const reveal = (Tag: "p" | "h1" | "h2" | "h3" | "h4" | "ul" | "ol" | "blockquote" | "table" | "hr") => {
  const C = ({ node, ...rest }: any) => (
    <Reveal>
      <Tag {...rest} />
    </Reveal>
  );
  C.displayName = `Reveal_${Tag}`;
  return C;
};

/* Raw HTML in markdown is parsed (rehype-raw), then sanitised with a
   GitHub-style schema plus the few extra tags/classes we render. */
const SANITIZE_SCHEMA: any = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "mark", "u", "sup", "sub", "kbd"],
  attributes: {
    ...defaultSchema.attributes,
    code: ["className"],
    pre: ["className"],
    span: ["className"],
    div: ["className"],
    details: ["open"],
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height"],
    td: ["align"],
    th: ["align"],
  },
};

export function Md({ text, caret }: { text: string; caret?: boolean }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }: any) => {
            const raw = String(children ?? "");
            const isBlock = raw.includes("\n") || className?.includes("language-");
            if (!isBlock) return <code className={className}>{children}</code>;
            return <CodeBlock lang={(className || "").replace("language-", "")} code={raw.replace(/\n$/, "")} />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
          ),
          p: reveal("p"),
          h1: reveal("h1"),
          h2: reveal("h2"),
          h3: reveal("h3"),
          h4: reveal("h4"),
          ul: reveal("ul"),
          ol: reveal("ol"),
          blockquote: reveal("blockquote"),
          table: reveal("table"),
          hr: reveal("hr"),
        }}
      >
        {text || ""}
      </ReactMarkdown>
      {caret && <span className="stream-caret" />}
    </div>
  );
}

/* ═══════════════════════════ thinking ═══════════════════════════ */

export function Thinking({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const secs = Math.max(1, Math.round(text.length / 42));
  return (
    <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-line)] bg-[var(--color-panel-2)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--color-panel-2)]"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Brain size={14} className="text-violet-500" />
          {streaming && <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/25" />}
        </span>
        <span className="text-[12.5px] font-semibold tracking-tight">
          {streaming ? "Thinking…" : `Thought for ${secs}s`}
        </span>
        <ChevronRight
          size={14}
          className={cn("ml-auto shrink-0 text-[var(--color-ink-3)] transition-transform duration-250", open && "rotate-90")}
        />
      </button>
      {streaming && !open && (
        <div className="thinking-track mx-3.5 mb-2.5 h-[2px] rounded-full bg-[var(--color-line)] text-violet-500" />
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.21, 0.9, 0.35, 1] }}
            className="overflow-hidden"
          >
            <div className="scroll-thin max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-[var(--color-line)] px-3.5 py-3 font-mono text-[11.8px] leading-relaxed text-[var(--color-ink-2)]">
              {text}
              {streaming && <span className="stream-caret" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════ tool tray ═══════════════════════════ */

const TOOL_ICON: Record<string, string> = {
  calculator: "∑", get_datetime: "◷", workspace_lookup: "⌕",
  fetch_url_text: "↗", web_search: "⚲",
};

export function ToolTray({ tools, streaming }: { tools: NonNullable<ChatMessage["toolCalls"]>; streaming?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="my-3 overflow-hidden rounded-[14px] border border-[var(--color-line)] bg-[var(--color-panel-2)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <Wrench size={14} className="shrink-0 text-sky-500" />
        <span className="text-[12.5px] font-semibold tracking-tight">
          {streaming ? "Running" : "Used"} {tools.length} tool{tools.length > 1 ? "s" : ""}
        </span>
        <span className="ml-auto flex -space-x-1">
          {tools.slice(0, 4).map((t) => (
            <span
              key={t.id}
              title={t.name}
              className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] font-mono text-[9px]"
            >
              {TOOL_ICON[t.name] ?? "⚙"}
            </span>
          ))}
        </span>
        <ChevronRight size={14} className={cn("shrink-0 text-[var(--color-ink-3)] transition-transform duration-250", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.21, 0.9, 0.35, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-[var(--color-line)] px-3.5 py-3">
              {tools.map((t) => (
                <div key={t.id} className="rounded-xl bg-[var(--color-panel)] p-2.5 ring-1 ring-[var(--color-line)]">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.status === "ok" ? "bg-emerald-500" : "bg-red-500")} />
                    <span className="truncate font-mono text-[12px] font-semibold">{t.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--color-ink-3)]">{t.ms}ms</span>
                  </div>
                  {Object.keys(t.args ?? {}).length > 0 && (
                    <div className="mt-1 truncate font-mono text-[10.8px] text-[var(--color-ink-3)]">
                      {JSON.stringify(t.args)}
                    </div>
                  )}
                  <pre className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-ink-2)]">
                    {t.result}
                  </pre>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════════════════════ message actions ═════════════════════════ */

function ActionBtn({
  icon, label, onClick, danger, active,
}: { icon: React.ReactNode; label: string; onClick?: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "press grid h-7 w-7 place-items-center rounded-lg transition-colors",
        active
          ? "text-emerald-500"
          : danger
            ? "text-[var(--color-ink-3)] hover:bg-red-500/12 hover:text-red-500"
            : "text-[var(--color-ink-3)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]",
      )}
    >
      {icon}
    </button>
  );
}

export function MsgActions({
  m, onCopy, copied, onSpeak, onRegen, onEdit, onDelete, isLast,
}: {
  m: ChatMessage; onCopy?: () => void; copied?: boolean; onSpeak?: () => void;
  onRegen?: () => void; onEdit?: () => void; onDelete?: () => void; isLast?: boolean;
}) {
  return (
    <div className="row-actions -ml-1.5 flex items-center gap-0.5">
      <ActionBtn label="Copy" onClick={onCopy} active={copied} icon={copied ? <Check size={13.5} /> : <Copy size={13.5} />} />
      {m.role === "assistant" && (
        <>
          <ActionBtn label="Read aloud" onClick={onSpeak} icon={<Volume2 size={13.5} />} />
          {isLast && <ActionBtn label="Regenerate" onClick={onRegen} icon={<RefreshCw size={13.5} />} />}
        </>
      )}
      {m.role === "user" && (
        <>
          <ActionBtn label="Edit & resend" onClick={onEdit} icon={<Pencil size={13.5} />} />
          <ActionBtn label="Delete" onClick={onDelete} danger icon={<Trash2 size={13.5} />} />
        </>
      )}
    </div>
  );
}

/* ═════════════════════════════ misc ═════════════════════════════ */

export function TypingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-panel-2)] px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-2)]"
            style={{ animation: `pulse-dot 1.25s ${i * 0.16}s infinite` }}
          />
        ))}
      </span>
      {label && <span className="text-[12.5px] text-[var(--color-ink-3)]">{label}</span>}
    </div>
  );
}

export function AttachmentThumbs({ atts }: { atts: Attachment[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {atts.map((a) =>
        a.kind === "image" ? (
          <a
            key={a.id}
            href={a.dataUrl}
            target="_blank"
            rel="noreferrer"
            className="press block overflow-hidden rounded-xl border border-[var(--color-line)]"
          >
            <img src={a.dataUrl} alt={a.name} className="h-24 w-24 object-cover transition-transform duration-300 hover:scale-105" />
          </a>
        ) : (
          <div
            key={a.id}
            className="flex max-w-[200px] items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-[12.5px]"
          >
            {a.kind === "audio" ? <Volume2 size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
            <span className="truncate font-medium">{a.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function ErrorCard({ msg }: { msg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="my-2 flex items-start gap-2.5 rounded-[14px] border border-red-500/25 bg-red-500/[.07] p-3.5 text-[13.5px] text-red-600 dark:text-red-300"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">Request failed</p>
        <p className="mt-1 break-words leading-relaxed opacity-90">{msg}</p>
        <p className="mt-1.5 text-[11.5px] opacity-70">
          Tip: connect Puter (top-right), toggle test mode, or switch to a smaller model.
        </p>
      </div>
    </motion.div>
  );
}

export function ScrollToBottom({ onClick, show }: { onClick: () => void; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          onClick={onClick}
          aria-label="Scroll to latest"
          className="press absolute bottom-3 left-1/2 z-20 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-float)] text-[var(--color-ink)] shadow-[0_8px_28px_-8px_rgba(0,0,0,.5)]"
        >
          <ArrowDown size={15} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function ImageResult({ src, alt }: { src: string; alt: string }) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="press my-3 block overflow-hidden rounded-[16px] border border-[var(--color-line)]"
    >
      <img src={src} alt={alt} className="max-h-[520px] w-full bg-[var(--color-panel-2)] object-contain" />
    </a>
  );
}

export { ImageIcon };
