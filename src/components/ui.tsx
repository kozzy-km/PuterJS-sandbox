import React, {
  useCallback, useEffect, useId, useLayoutEffect, useMemo,
  useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../utils/cn";

/* ═══════════════════════════ handmade hooks ═══════════════════════════ */

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Fires `fn` on outside pointer-down — used by every popover in the app. */
function useOutside(
  refs: (React.RefObject<HTMLElement | null> | undefined)[],
  fn: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Ignore clicks that land inside any of the registered nodes.
      if (refs.some((r) => r?.current?.contains(target))) return;
      fn();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fn, ...refs]);
}

/* ══════════════════════════════ SELECT ══════════════════════════════
   Replaces every native <select> in the app. Rendered in a portal so it
   is never clipped by a scrolling drawer, flips above the trigger when
   there is no room below, and is fully keyboard navigable.
   ══════════════════════════════════════════════════════════════════ */

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  group?: string;
}

export function Select({
  value, onChange, options, placeholder = "Select…",
  searchable, disabled, size = "md", className, align = "left",
  label, id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  align?: "left" | "right";
  label?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.toLowerCase();
    return options.filter((o) =>
      (o.label + " " + (o.hint ?? "") + " " + o.value).toLowerCase().includes(needle));
  }, [options, q]);

  const measure = useCallback(() => {
    const el = btnRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) { setQ(""); return; }
    const i = Math.max(0, filtered.findIndex((o) => o.value === value));
    setHi(i);
    const t = setTimeout(() => searchRef.current?.focus(), 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setHi((h) => Math.min(h, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  // The trigger is a sibling of the portal, so it must be excluded explicitly —
  // otherwise mousedown closes the popover and the click immediately reopens it.
  useOutside([popRef, btnRef], () => setOpen(false), open);

  const commit = (v: string) => { onChange(v); setOpen(false); btnRef.current?.focus(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setHi((h) => (h + 1) % Math.max(1, filtered.length)); break;
      case "ArrowUp":   e.preventDefault(); setHi((h) => (h - 1 + filtered.length) % Math.max(1, filtered.length)); break;
      case "Home":      e.preventDefault(); setHi(0); break;
      case "End":       e.preventDefault(); setHi(filtered.length - 1); break;
      case "Enter":     e.preventDefault(); if (filtered[hi]) commit(filtered[hi].value); break;
      case "Escape":    e.preventDefault(); setOpen(false); break;
      case "Tab":       setOpen(false); break;
    }
  };

  // Where does the popover go?
  const GAP = 6, MAXH = 320, EDGE = 10;
  const style: React.CSSProperties = { position: "fixed", zIndex: 200 };
  if (rect) {
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const placeBelow = below > Math.min(MAXH, 200) || below >= above;
    const maxH = Math.min(MAXH, (placeBelow ? below : above) - GAP - EDGE);
    const width = Math.min(
      Math.max(rect.width, 200),
      window.innerWidth - EDGE * 2,
    );
    if (placeBelow) style.top = rect.bottom + GAP;
    else style.bottom = window.innerHeight - rect.top + GAP;
    if (align === "right") style.right = Math.max(EDGE, window.innerWidth - rect.right);
    else style.left = Math.min(rect.left, window.innerWidth - EDGE - width);
    style.width = width;
    style.maxHeight = Math.max(160, maxH);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    filtered.forEach((o) => {
      const k = o.group ?? "";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    });
    return [...map.entries()];
  }, [filtered]);

  const pad = size === "sm" ? "px-2.5 py-1.5 text-[12.5px]" : "px-3 py-2.5 text-[13.5px]";

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => { measure(); setOpen((o) => !o); }}
        onKeyDown={onKeyDown}
        className={cn(
          "press flex w-full items-center gap-2 rounded-xl border text-left",
          pad,
          open ? "border-[var(--color-line-2)] bg-[var(--color-panel-2)]" : "border-[var(--color-line)] bg-transparent hover:bg-[var(--color-panel-2)]",
          disabled && "cursor-not-allowed opacity-40",
          className,
        )}
      >
        {current?.icon && <span className="flex shrink-0 items-center">{current.icon}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">
          {current ? current.label : <span className="text-[var(--color-ink-3)]">{placeholder}</span>}
        </span>
        {current?.hint && (
          <span className="hidden shrink-0 truncate text-[11px] text-[var(--color-ink-3)] sm:block">{current.hint}</span>
        )}
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-[var(--color-ink-3)] transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          style={style}
          className="animate-float-in flex flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-float)] shadow-[0_24px_70px_-18px_rgba(0,0,0,.55)]"
        >
          {searchable && (
            <div className="relative shrink-0 border-b border-[var(--color-line)] p-2">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="w-full rounded-lg bg-transparent py-1.5 pl-7 pr-2 text-[13px] outline-none placeholder:text-[var(--color-ink-3)]"
              />
            </div>
          )}

          <div id={listId} role="listbox" className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-[12.5px] text-[var(--color-ink-3)]">No matches</p>
            )}
            {grouped.map(([g, items]) => (
              <div key={g || "_"}>
                {g && (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-ink-3)]">
                    {g}
                  </p>
                )}
                {items.map((o) => {
                  const idx = filtered.indexOf(o);
                  const sel = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onMouseEnter={() => setHi(idx)}
                      onClick={() => commit(o.value)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left transition-colors",
                        idx === hi ? "bg-[var(--color-panel-2)]" : "bg-transparent",
                      )}
                    >
                      {o.icon && <span className="flex shrink-0 items-center">{o.icon}</span>}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[13px]", sel ? "font-semibold" : "font-medium")}>{o.label}</span>
                        {o.hint && <span className="block truncate text-[11px] text-[var(--color-ink-3)]">{o.hint}</span>}
                      </span>
                      {sel && <Check size={14} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ══════════════════════════════ SHEET ══════════════════════════════
   One overlay primitive for the whole app.
     side="right"  → right-edge panel on desktop, bottom sheet on phones
     side="bottom" → bottom sheet everywhere
     side="center" → centred dialog, becomes a bottom sheet on phones
   Phones get a drag-down-to-dismiss grabber; everything gets a spring.
   ══════════════════════════════════════════════════════════════════ */

export function Sheet({
  open, onClose, children, side = "center", title, subtitle, icon, footer,
  width = 420, maxHeight = "92dvh",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: "right" | "bottom" | "center";
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  maxHeight?: string;
}) {
  const isPhone = useMediaQuery("(max-width: 767px)");
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sheet = side === "bottom" || (side !== "center" && isPhone);
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.9 };

  const motionProps: any = sheet
    ? {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: spring,
        drag: isPhone && !reduce ? "y" : false,
        dragListener: false,
        dragControls,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0, bottom: 0.55 },
        onDragEnd: (_: any, info: any) => {
          if (info.offset.y > 130 || info.velocity.y > 620) onClose();
        },
      }
    : side === "right"
      ? { initial: { x: width + 40, opacity: 0.4 }, animate: { x: 0, opacity: 1 }, exit: { x: width + 40, opacity: 0.2 }, transition: spring }
      : { initial: { opacity: 0, y: 18, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 10, scale: 0.98 }, transition: spring };

  // The panel shell. Kept in a variable so the centred variant can sit inside a
  // flex centring wrapper — framer-motion writes an inline `transform`, which
  // would otherwise clobber Tailwind's -translate-x/y-1/2 centring classes.
  const panelShell = cn(
    "flex flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-panel)] shadow-[0_30px_90px_-20px_rgba(0,0,0,.7)]",
    sheet
      ? `w-full rounded-t-[26px]${footer ? "" : " pb-[var(--safe-b)]"}`
      : side === "right"
        ? "rounded-l-[22px] sm:rounded-l-[26px]"
        : "w-full max-h-[86dvh] rounded-[22px]",
  );

  const panelStyle: React.CSSProperties = sheet
    ? { maxHeight }
    : side === "right"
      ? { width, maxWidth: "100vw" }
      : { width, maxWidth: "calc(100vw - 2rem)" };

  const panel = (
    <motion.div {...motionProps} style={panelStyle} className={panelShell}>
            {sheet && (
              <div
                onPointerDown={(e) => { if (!reduce) dragControls.start(e); }}
                className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
              >
                <span className="h-1 w-10 rounded-full bg-[var(--color-line-2)]" />
              </div>
            )}

            {title && (
              <header className={cn(
                "flex shrink-0 items-center gap-2.5 border-b border-[var(--color-line)] px-4 pb-3",
                sheet ? "pt-1" : "pt-4",
              )}>
                {icon && <span className="shrink-0 text-[var(--color-ink-2)]">{icon}</span>}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-semibold tracking-tight">{title}</h2>
                  {subtitle && <p className="truncate text-[11.5px] text-[var(--color-ink-3)]">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-ink-3)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M5 5l14 14M19 5L5 19" />
                  </svg>
                </button>
              </header>
            )}

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>

      {footer && (
        <div className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3 pb-[max(0.75rem,var(--safe-b))]">
          {footer}
        </div>
      )}
    </motion.div>
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
          />
          {sheet ? (
            <div className="absolute inset-x-0 bottom-0 flex justify-center">{panel}</div>
          ) : side === "right" ? (
            <div className="absolute inset-y-0 right-0 flex">{panel}</div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="pointer-events-auto flex max-h-full w-full justify-center">{panel}</div>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════ BUTTON ══════════════════════════════ */

export function Btn({
  children, onClick, variant = "ghost", size = "md", disabled, className, title, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean; className?: string; title?: string; type?: "button" | "submit";
}) {
  const sizes = { sm: "h-8 px-3 text-[12.5px]", md: "h-10 px-4 text-[13.5px]", lg: "h-12 px-5 text-[14.5px]" };
  const variants = {
    primary:   "bg-[var(--color-brand)] text-[var(--color-brand-ink)] hover:opacity-88",
    secondary: "border border-[var(--color-line)] bg-[var(--color-panel-2)] hover:border-[var(--color-line-2)]",
    ghost:     "hover:bg-[var(--color-panel-2)]",
    danger:    "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <button
      type={type} title={title} onClick={onClick} disabled={disabled}
      className={cn(
        "press inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold tracking-tight",
        sizes[size], variants[variant],
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ═════════════════════════════ CONTROLS ═════════════════════════════ */

export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={cn(
      "press relative h-[23px] w-[40px] shrink-0 rounded-full transition-colors duration-250",
      on ? "bg-[var(--color-brand)]" : "bg-[var(--color-panel-2)] border border-[var(--color-line)]",
    )}
  >
    <span
      className="toggle-dot absolute top-[3px] h-[17px] w-[17px] rounded-full shadow-[0_1px_4px_rgba(0,0,0,.35)]"
      style={{
        left: on ? 20 : 3,
        background: on ? "var(--color-brand-ink)" : "var(--color-ink-3)",
      }}
    />
  </button>
);

export const Slider = ({
  value, min, max, step, onChange, disabled,
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }) => {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      style={{ ["--fill" as any]: `${fill}%` }}
      min={min} max={max} step={step} value={value} disabled={disabled}
      aria-label="value"
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
};

export const Seg = <T extends string>({
  options, value, onChange, size = "md",
}: {
  options: { v: T; label: string; hint?: string; icon?: React.ReactNode }[];
  value: T; onChange: (v: T) => void; size?: "sm" | "md";
}) => {
  const idx = Math.max(0, options.findIndex((o) => o.v === value));
  const pillId = useId();
  return (
    <div className="relative flex gap-0.5 rounded-xl bg-[var(--color-panel-2)] p-1">
      {options.map((o, i) => {
        // Sliding pill: purely decorative highlight behind the active option.
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            title={o.hint}
            onClick={() => onChange(o.v)}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1 rounded-lg font-medium transition-colors duration-200",
              size === "sm" ? "px-2 py-[5px] text-[11.5px]" : "px-2.5 py-1.5 text-[12.5px]",
              active ? "text-[var(--color-brand-ink)]" : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-pill-${pillId}`}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 -z-10 rounded-lg bg-[var(--color-brand)]"
              />
            )}
            {o.icon}
            <span className="relative truncate">{o.label}</span>
            <span className="sr-only">{i === idx ? "selected" : ""}</span>
          </button>
        );
      })}
    </div>
  );
};

export const Field = ({
  label, hint, warn, children, right,
}: {
  label: React.ReactNode; hint?: React.ReactNode; warn?: React.ReactNode;
  children: React.ReactNode; right?: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <label className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[var(--color-ink-3)]">
        {label}
      </label>
      {right}
    </div>
    {children}
    {warn ? (
      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-amber-500">
        <span className="mt-[1px] shrink-0">⚠</span><span>{warn}</span>
      </p>
    ) : hint ? (
      <p className="text-[11.5px] leading-snug text-[var(--color-ink-3)]">{hint}</p>
    ) : null}
  </div>
);

/** Collapsible settings group — keeps the long parameter panel scannable. */
export const Section = ({
  title, children, defaultOpen = true, badge,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--color-panel-2)]"
      >
        <span className="flex-1 text-[10.5px] font-bold uppercase tracking-[.11em] text-[var(--color-ink-2)]">
          {title}
        </span>
        {badge}
        <ChevronDown size={14} className={cn("shrink-0 text-[var(--color-ink-3)] transition-transform duration-250", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.21, 0.9, 0.35, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-[var(--color-line)] px-3.5 py-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export const Chip = ({
  children, tone = "zinc", onClick, className,
}: {
  children: React.ReactNode;
  tone?: "zinc" | "green" | "amber" | "red" | "blue" | "violet";
  onClick?: () => void;
  className?: string;
}) => {
  const tones: Record<string, string> = {
    zinc:   "bg-[var(--color-panel-2)] text-[var(--color-ink-2)] border border-[var(--color-line)]",
    green:  "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    amber:  "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    red:    "bg-red-500/12 text-red-600 dark:text-red-400",
    blue:   "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  };
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-medium tracking-tight",
        tones[tone], onClick && "press cursor-pointer", className,
      )}
    >
      {children}
    </span>
  );
};

export const IconBtn = ({
  children, onClick, title, active, danger, size = 36, className,
}: {
  children: React.ReactNode; onClick?: (e?: any) => void; title?: string;
  active?: boolean; danger?: boolean; size?: number; className?: string;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    style={{ width: size, height: size }}
    className={cn(
      "press grid shrink-0 place-items-center rounded-xl transition-colors",
      active
        ? "bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
        : danger
          ? "text-[var(--color-ink-3)] hover:bg-red-500/10 hover:text-red-500"
          : "text-[var(--color-ink-3)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]",
      className,
    )}
  >
    {children}
  </button>
);

export const Meter = ({ value, max, tone }: { value: number; max: number; tone?: string }) => {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100);
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
      <motion.div
        className={cn("h-full rounded-full", tone ?? "bg-[var(--color-ink)]")}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 160, damping: 26 }}
      />
    </div>
  );
};

export const Spinner = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity=".22" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const Divider = ({ label }: { label?: string }) =>
  label ? (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[var(--color-line)]" />
      <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ink-3)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--color-line)]" />
    </div>
  ) : <div className="h-px w-full bg-[var(--color-line)]" />;
