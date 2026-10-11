/* ═══════════════════════════════════════════════════════════════════
   File ingestion helpers — kind detection, pretty sizes and .zip
   auto-extraction (fflate, ~8 KB gz). Keeps App/Workspace code small.
   ═══════════════════════════════════════════════════════════════════ */
import { unzipSync } from "fflate";
import type { WorkspaceFile } from "./store";
import { uid } from "./store";

export const TEXT_EXT = "md|markdown|txt|text|json|jsonc|csv|tsv|log|yml|yaml|toml|ini|env|conf|cfg|xml|html|htm|css|scss|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cc|cs|php|lua|luau|sh|bash|zsh|fish|sql|graphql|gql|proto|r|dart|ex|exs|erl|hs|clj|scala|diff|patch|tex|rst|adoc|srt|vtt|gitignore|dockerfile|makefile|license|editorconfig|prettierrc|eslintrc";
export const IMG_EXT = "png|jpe?g|gif|webp|avif|svg|bmp|ico";
export const AUD_EXT = "mp3|wav|ogg|oga|m4a|aac|flac|opus";

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();
export const isTextName = (n: string) => new RegExp(`^(${TEXT_EXT})$`).test(ext(n)) || !ext(n);
export const isImgName = (n: string) => new RegExp(`^(${IMG_EXT})$`).test(ext(n));
export const isAudName = (n: string) => new RegExp(`^(${AUD_EXT})$`).test(ext(n));

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export const kindFor = (name: string, mime = ""): WorkspaceFile["kind"] =>
  mime.startsWith("image/") || isImgName(name) ? "image"
    : mime.startsWith("audio/") || isAudName(name) ? "audio"
      : "doc";

/* caps — localStorage is the only backend, so be polite */
export const MAX_TEXT = 120_000;      // chars kept per text file
export const MAX_ZIP_ENTRIES = 80;
export const MAX_ZIP_FILE = 1_500_000; // bytes per entry we even look at

export interface Ingested { name: string; kind: WorkspaceFile["kind"]; content: string; size: number; truncated?: boolean }

/** Reads one File into workspace shape. `.zip` is expanded by expandZip(). */
export async function readFileForWorkspace(f: File): Promise<Ingested[]> {
  if (/\.zip$/i.test(f.name)) return expandZip(f);
  if (f.type.startsWith("image/") || isImgName(f.name)) {
    const dataUrl = await fileToDataUrlSafe(f);
    return [{ name: f.name, kind: "image", content: dataUrl, size: f.size }];
  }
  const t = await f.text().catch(() => "");
  const truncated = t.length > MAX_TEXT;
  return [{ name: f.name, kind: kindFor(f.name, f.type), content: t.slice(0, MAX_TEXT), size: f.size, truncated }];
}

export async function expandZip(f: File): Promise<Ingested[]> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(buf); } catch { return []; }
  const out: Ingested[] = [];
  const names = Object.keys(entries).sort();
  for (const path of names) {
    if (out.length >= MAX_ZIP_ENTRIES) break;
    if (path.endsWith("/") || /__MACOSX|\.DS_Store|Thumbs\.db/i.test(path)) continue;
    const bytes = entries[path];
    if (!bytes || bytes.length > MAX_ZIP_FILE) continue;
    const name = path.split("/").pop() || path;
    if (isImgName(name)) {
      out.push({ name, kind: "image", content: bytesToDataUrl(bytes, mimeFor(name)), size: bytes.length });
    } else if (isTextName(name) || bytes.length < 400_000) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      // skip binaries that slipped through the extension filter
      if (text.slice(0, 512).includes("\u0000")) continue;
      out.push({ name, kind: kindFor(name), content: text.slice(0, MAX_TEXT), size: bytes.length, truncated: text.length > MAX_TEXT });
    }
  }
  return out;
}

const mimeFor = (name: string) =>
  ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon" } as Record<string, string>)[ext(name)] || "image/png";

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return `data:${mime};base64,${btoa(bin)}`;
}

function fileToDataUrlSafe(f: File): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res("");
    r.readAsDataURL(f);
  });
}

export const toWorkspaceFile = (i: Ingested, attach = true): WorkspaceFile => ({
  id: uid(), name: i.name, kind: i.kind, content: i.content, size: i.size || i.content.length,
  updatedAt: Date.now(), attach,
});
