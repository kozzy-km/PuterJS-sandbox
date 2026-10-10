import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, Play, X, LayoutGrid } from "lucide-react";
import { store } from "../lib/store";
import { timeAgo } from "../lib/store";
import { Seg, Btn } from "./ui";
import { cn } from "../utils/cn";

interface Asset {
  id?: string;
  src: string;
  prompt: string;
  model: string;
  ts: number;
  kind: "image" | "video";
}

export function Gallery({ onToast }: { onToast: (m: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>(() => (store.gallery ?? []).slice(0, 60));
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [preview, setPreview] = useState<Asset | null>(null);

  const shown = assets.filter((a) => filter === "all" || a.kind === filter);

  const persist = (next: Asset[]) => {
    setAssets(next);
    store.gallery = next;
  };

  const remove = (a: Asset) => {
    persist(assets.filter((x) => x !== a));
    setPreview(null);
    onToast("Removed from gallery");
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={17} />
          <h2 className="text-[15px] font-bold tracking-tight">Gallery</h2>
          <span className="text-[12px] text-[var(--color-ink-3)]">{assets.length} saved locally</span>
        </div>
        <div className="ml-auto w-56">
          <Seg
            value={filter}
            onChange={setFilter}
            options={[
              { v: "all" as const, label: "All" },
              { v: "image" as const, label: "Images" },
              { v: "video" as const, label: "Videos" },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-[var(--color-line)] text-[13.5px] text-[var(--color-ink-3)]">
          Nothing generated yet — try Image Lab or ask an image model in chat.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {shown.map((a, i) => (
              <motion.figure
                key={(a.id ?? "") + a.ts + i}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="group relative overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]"
              >
                <button onClick={() => setPreview(a)} className="block w-full text-left">
                  {a.kind === "image" ? (
                    <img src={a.src} alt={a.prompt} loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="relative aspect-square w-full bg-black">
                      <video src={a.src} preload="metadata" className="h-full w-full object-cover opacity-80" />
                      <span className="absolute inset-0 grid place-items-center text-white">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/18 backdrop-blur">
                          <Play size={17} fill="currentColor" />
                        </span>
                      </span>
                    </div>
                  )}
                </button>
                <figcaption className="p-2.5">
                  <p className="line-clamp-2 text-[11.5px] leading-snug text-[var(--color-ink-2)]">{a.prompt}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--color-ink-3)]">
                    {a.model} · {timeAgo(a.ts)}
                  </p>
                </figcaption>
                <button
                  onClick={() => remove(a)}
                  aria-label="Delete"
                  className="press absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-red-500"
                >
                  <Trash2 size={12} />
                </button>
              </motion.figure>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* lightbox */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPreview(null)}
            className="fixed inset-0 z-[95] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88dvh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b0d]"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">{preview.prompt}</p>
                <a
                  href={preview.src}
                  download={`nexus-${preview.ts}.${preview.kind === "video" ? "mp4" : "png"}`}
                  className="press flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-black"
                >
                  <Download size={12} /> Save
                </a>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Close"
                  className="press grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="max-h-[72dvh] overflow-auto bg-black">
                {preview.kind === "image" ? (
                  <img src={preview.src} alt={preview.prompt} className="mx-auto max-h-[70dvh] w-auto object-contain" />
                ) : (
                  <video src={preview.src} controls autoPlay className="mx-auto max-h-[70dvh] w-full" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function GalleryEmptyHint({ className }: { className?: string }) {
  return (
    <div className={cn("text-[12.5px] text-[var(--color-ink-3)]", className)}>
      <Btn size="sm" variant="secondary">Open gallery</Btn>
    </div>
  );
}
