import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Paperclip, Mic, MicOff, Square, ArrowUp, Image as ImageIcon, FileText,
  FolderOpen, Sparkles, Settings2, X, Globe, Brain, Wrench, FlaskConical,
} from "lucide-react";
import type { Attachment } from "../lib/store";
import { IconBtn } from "./ui";
import { cn } from "../utils/cn";

/* ═══════════════════════ attach popover ═══════════════════════ */

function AttachMenu({
  open, onClose, onPick, onWorkspace, onGenerate,
}: {
  open: boolean; onClose: () => void;
  onPick: (kind: "image" | "file" | "audio") => void;
  onWorkspace: () => void; onGenerate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          !(e.target as HTMLElement).closest("[data-attach-trigger]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const items = [
    { t: "Photo or image", i: <ImageIcon size={15} />, f: () => onPick("image") },
    { t: "Document or text", i: <FileText size={15} />, f: () => onPick("file") },
    { t: "Audio (auto-transcribe)", i: <Mic size={15} />, f: () => onPick("audio") },
    { t: "Workspace files", i: <FolderOpen size={15} />, f: onWorkspace },
    { t: "Generate an image…", i: <Sparkles size={15} />, f: onGenerate },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 460, damping: 34 }}
          style={{ transformOrigin: "bottom left" }}
          className="absolute bottom-[calc(100%+10px)] left-0 z-40 w-60 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-float)] p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,.6)]"
        >
          {items.map((b) => (
            <button
              key={b.t}
              onClick={() => { b.f(); onClose(); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[var(--color-panel-2)]"
            >
              <span className="text-[var(--color-ink-3)]">{b.i}</span>{b.t}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════ composer ═══════════════════════════ */

const ComposerImpl = function Composer({
  input, setInput, onSend, onStop, streaming, attachments, setAttachments,
  modelName, listening, onMic, onOpenSettings, onOpenWorkspace, onGenerateImage,
  estTokens, wsCount, toolCount, caps, flags, onPickFiles, taRef, enterToSend,
}: {
  input: string; setInput: (v: string) => void;
  onSend: () => void; onStop: () => void; streaming: boolean;
  attachments: Attachment[]; setAttachments: (a: Attachment[]) => void;
  modelName: string; listening: boolean; onMic: () => void;
  onOpenSettings: () => void; onOpenWorkspace: () => void; onGenerateImage: () => void;
  estTokens: number; wsCount: number; toolCount: number;
  caps: { vision: boolean; webSearch: boolean; reasoning: boolean };
  flags: { web: boolean; tools: boolean; test: boolean; stream: boolean };
  onPickFiles: (files: FileList | null, kind: "image" | "file" | "audio") => void;
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  enterToSend: boolean;
}) {
  const [attachMenu, setAttachMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const imgIn = useRef<HTMLInputElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const audIn = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !streaming;

  // Grow-with-content. Done in JS rather than relying on `field-sizing: content`
  // so the composer behaves identically in Firefox and older Safari.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 176) + "px";
  }, [input, taRef]);

  const pick = (kind: "image" | "file" | "audio") => {
    if (kind === "image") imgIn.current?.click();
    else if (kind === "file") fileIn.current?.click();
    else audIn.current?.click();
  };

  // Drag & drop anywhere onto the composer.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files?.length) onPickFiles(files, "image");
  };

  return (
    <div className="shrink-0 bg-[var(--color-canvas)] px-3 pb-[max(0.5rem,var(--safe-b))] pt-2">
      <div className="mx-auto w-full max-w-3xl">
        {/* attachment chips */}
        <AnimatePresence initial={false}>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.21, 0.9, 0.35, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 pb-2 pt-0.5">
                <AnimatePresence initial={false}>
                  {attachments.map((a) => (
                    <motion.span
                      key={a.id}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 480, damping: 34 }}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] py-1 pl-1 pr-1.5 text-[12px]"
                    >
                      {a.kind === "image" ? (
                        <img src={a.dataUrl} className="h-7 w-7 rounded-lg object-cover" alt="" />
                      ) : a.kind === "audio" ? (
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-panel)]"><Mic size={12} /></span>
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-panel)]"><FileText size={12} /></span>
                      )}
                      <span className="max-w-[130px] truncate font-medium">{a.name}</span>
                      <button
                        onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                        aria-label={`Remove ${a.name}`}
                        className="press grid h-5 w-5 place-items-center rounded-md text-[var(--color-ink-3)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                      >
                        <X size={11} />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the input shell */}
        <div
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
          onDrop={onDrop}
          className="composer-shell relative rounded-[22px] border border-[var(--color-line)] bg-[var(--color-panel)]"
        >
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="drop-veil text-[13px] font-medium"
              >
                Drop images or files to attach
              </motion.div>
            )}
          </AnimatePresence>

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              if (enterToSend && canSend) onSend();
              else if (!enterToSend) setInput(input + "\n");
            }}
            placeholder={`Ask ${modelName}…`}
            aria-label="Message"
            className="autogrow scroll-thin max-h-44 w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-3)]"
          />

          <div className="flex items-center gap-0.5 px-2 pb-2 pt-0.5">
            <div className="relative">
              <IconBtn
                title="Attach"
                onClick={() => setAttachMenu((v) => !v)}
                active={attachMenu}
              >
                <span data-attach-trigger>
                  <Paperclip size={17} />
                </span>
              </IconBtn>
              <AttachMenu
                open={attachMenu}
                onClose={() => setAttachMenu(false)}
                onPick={pick}
                onWorkspace={onOpenWorkspace}
                onGenerate={onGenerateImage}
              />
            </div>

            <IconBtn title={listening ? "Stop dictation" : "Voice input"} onClick={onMic} active={listening}>
              {listening ? <MicOff size={17} className="text-red-500" /> : <Mic size={17} />}
            </IconBtn>

            {/* live capability pills — the "advanced settings" made legible */}
            <div className="ml-1 hidden min-w-0 items-center gap-1 sm:flex">
              {flags.web && caps.webSearch && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-[3px] text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  <Globe size={9.5} /> web
                </span>
              )}
              {flags.tools && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-sky-500/12 px-2 py-[3px] text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                  <Wrench size={9.5} /> {toolCount}
                </span>
              )}
              {caps.reasoning && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-500/12 px-2 py-[3px] text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                  <Brain size={9.5} /> think
                </span>
              )}
              {flags.test && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-[3px] text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  <FlaskConical size={9.5} /> test
                </span>
              )}
              {wsCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-panel-2)] px-2 py-[3px] font-mono text-[10px] text-[var(--color-ink-2)]">
                  <Paperclip size={9.5} /> {wsCount}
                </span>
              )}
            </div>

            <span className="hidden shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--color-ink-3)] md:block">
              {estTokens > 0 ? `~${estTokens} tok` : ""}
            </span>

            {/* Pushes send/stop to the trailing edge on every breakpoint. */}
            <span className="flex-1" />

            <IconBtn title="Parameters" onClick={onOpenSettings} className="sm:hidden">
              <Settings2 size={17} />
            </IconBtn>

            {/* send / stop */}
            <AnimatePresence mode="wait" initial={false}>
              {streaming ? (
                <motion.button
                  key="stop"
                  type="button"
                  initial={{ scale: 0.7, opacity: 0, rotate: -90 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.7, opacity: 0, rotate: 90 }}
                  transition={{ type: "spring", stiffness: 520, damping: 32 }}
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-500 text-white"
                >
                  <Square size={13} fill="currentColor" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  type="button"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 32 }}
                  onClick={onSend}
                  disabled={!canSend}
                  aria-label="Send message"
                  className={cn(
                    "press relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full transition-colors",
                    canSend
                      ? "bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
                      : "bg-[var(--color-panel-2)] text-[var(--color-ink-3)]",
                  )}
                >
                  {canSend && (
                    <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-white/25" />
                  )}
                  <ArrowUp size={17} strokeWidth={2.6} className="relative" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10.5px] text-[var(--color-ink-3)]">
          Puter.js can make mistakes — verify important info.{" "}
          <button onClick={onOpenSettings} className="underline underline-offset-2 hover:text-[var(--color-ink-2)]">
            parameters
          </button>
        </p>
      </div>

      <input
        ref={imgIn} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onPickFiles(e.target.files, "image"); e.target.value = ""; }}
      />
      <input
        ref={fileIn} type="file" accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,text/*" multiple className="hidden"
        onChange={(e) => { onPickFiles(e.target.files, "file"); e.target.value = ""; }}
      />
      <input
        ref={audIn} type="file" accept="audio/*,video/*" multiple className="hidden"
        onChange={(e) => { onPickFiles(e.target.files, "audio"); e.target.value = ""; }}
      />
    </div>
  );
}

export const Composer = memo(ComposerImpl);
