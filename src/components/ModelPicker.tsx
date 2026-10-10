import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Check, Zap, Gauge, Coins, X } from "lucide-react";
import { MODEL_CATALOG, type AIModel } from "../lib/puter";
import { Sheet, Chip } from "./ui";
import { cn } from "../utils/cn";

const Dot5 = ({ n, className }: { n: number; className?: string }) => (
  <span className="flex shrink-0 items-center gap-[3px]">
    {[1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        className={cn(
          "h-[3px] w-[6px] rounded-full transition-colors",
          i <= n ? (className ?? "bg-current") : "bg-[var(--color-line-2)]",
        )}
      />
    ))}
  </span>
);

const Meter5 = ({ label, icon, n }: { label: string; icon: React.ReactNode; n: number }) => (
  <span className="flex items-center gap-1 text-[var(--color-ink-3)]" title={`${label} ${n}/5`}>
    {icon}
    <Dot5 n={n} />
  </span>
);

export function ModelPicker({
  open, onClose, value, onChange, liveModels,
}: {
  open: boolean; onClose: () => void;
  value: string; onChange: (id: string) => void;
  liveModels: any[];
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 220);
    }
  }, [open]);

  const merged = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const stat = needle
      ? MODEL_CATALOG.filter((m) => (m.id + m.name + m.vendor + m.family + m.tagline).toLowerCase().includes(needle))
      : MODEL_CATALOG;
    const live: any[] = needle
      ? liveModels
          .filter((m: any) => String(m.id || "").toLowerCase().includes(needle))
          .slice(0, 40)
          .map((m: any) => ({ dynamic: true, ...m }))
      : [];
    return { stat, live };
  }, [q, liveModels]);

  const Row = ({ m }: { m: AIModel }) => {
    const sel = value === m.id;
    return (
      <button
        onClick={() => { onChange(m.id); onClose(); }}
        className={cn(
          "press flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
          sel
            ? "border-[var(--color-line-2)] bg-[var(--color-panel-2)]"
            : "border-transparent hover:bg-[var(--color-panel-2)]",
        )}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[13px] font-bold text-white"
          style={{ background: m.color === "#e5e5e5" || m.color === "#d4d4d8" ? "#3f3f46" : m.color }}
        >
          {m.name[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold tracking-tight">{m.name}</span>
            <span className="shrink-0 truncate text-[11px] text-[var(--color-ink-3)]">· {m.vendor}</span>
          </span>
          <span className="block truncate text-[11.5px] text-[var(--color-ink-2)]">{m.tagline}</span>
          <span className="mt-1 flex items-center gap-2.5">
            <Meter5 label="Speed" n={m.speed} icon={<Zap size={10} />} />
            <Meter5 label="Quality" n={m.quality} icon={<Gauge size={10} />} />
            <Meter5 label="Cost" n={6 - m.cost} icon={<Coins size={10} />} />
            <span className="font-mono text-[10px] text-[var(--color-ink-3)]">{(m.context / 1000).toFixed(0)}k</span>
          </span>
        </span>
        {sel && <Check size={16} className="shrink-0" />}
      </button>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="center"
      width={560}
      title="Choose a model"
      subtitle={`${MODEL_CATALOG.length} curated${liveModels.length ? ` · ${liveModels.length} live from Puter` : ""}`}
      icon={<Gauge size={16} />}
    >
      <div className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-panel)] p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Search gpt, claude, gemini, grok, llama…"
            className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] py-2.5 pl-9 pr-9 text-[13.5px] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-line-2)]"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="press absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[var(--color-ink-3)] hover:bg-[var(--color-panel)]"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="scroll-thin space-y-1 p-2">
        {merged.stat.length === 0 && merged.live.length === 0 && (
          <p className="px-3 py-12 text-center text-[13px] text-[var(--color-ink-3)]">
            No model matches “{q}”.<br />
            <span className="text-[11.5px]">Connect Puter to search the full live catalog.</span>
          </p>
        )}

        {merged.stat.map((m) => <Row key={m.id} m={m} />)}

        {merged.live.length > 0 && (
          <>
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="h-px flex-1 bg-[var(--color-line)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ink-3)]">
                Live from Puter
              </span>
              <span className="h-px flex-1 bg-[var(--color-line)]" />
            </div>
            {merged.live.map((m: any) => {
              const sel = value === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); onClose(); }}
                  className={cn(
                    "press flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                    sel ? "border-[var(--color-line-2)] bg-[var(--color-panel-2)]" : "border-transparent hover:bg-[var(--color-panel-2)]",
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--color-panel-2)] text-[13px] font-bold">
                    ✦
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12.5px] font-semibold">{m.id}</span>
                    <span className="block truncate text-[11.5px] text-[var(--color-ink-3)]">
                      {m.provider || "live"} · ctx {m.context ? (m.context / 1000).toFixed(0) + "k" : "?"}
                    </span>
                  </span>
                  {sel && <Check size={16} className="shrink-0" />}
                </button>
              );
            })}
          </>
        )}
      </div>
    </Sheet>
  );
}

/* Compact trigger used in the top bar. */
export function ModelTrigger({ model, onClick }: { model: AIModel; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 34 }}
      className="press flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] py-1 pl-1 pr-2.5 hover:border-[var(--color-line-2)]"
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
        style={{ background: model.color === "#e5e5e5" || model.color === "#d4d4d8" ? "#3f3f46" : model.color }}
      >
        {model.name[0]}
      </span>
      <span className="min-w-0 truncate text-[12.8px] font-semibold tracking-tight">{model.name}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-[var(--color-ink-3)]">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </motion.button>
  );
}

export { Chip as ModelChip };
