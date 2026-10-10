# NEXUS — Local AI Studio on Puter.js

A local-first AI studio that talks to **500+ models through [Puter.js](https://docs.puter.com/)** — no API keys, no server, no account required to browse. Chats, workspace files and generated media live in `localStorage` on your device.

The UI is built to feel like a **native mobile app** in the spirit of Grok/xAI: true-black canvas, hairline borders, spring-eased sheets, drag-to-dismiss, edge-swipe navigation, safe-area aware, and a bottom tab bar on phones — while keeping every advanced generation parameter one tap away.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/index.html (single self-contained file)
npm run smoke    # headless UI test, desktop + phone layouts
```

---

## What's in the box

| Surface | What it does |
|---|---|
| **Chat** | Streaming, markdown, reasoning blocks, tool calls, inline image generation, attachments, voice input, TTS read-back |
| **Image Lab** | `txt2img` across OpenAI / Gemini / xAI / BytePlus / FLUX, with quality, aspect ratio and image-to-image reference |
| **Video Lab** | `txt2vid` across Wan / Seedance / Veo, with duration, resolution, soundtrack, negative prompt and first-frame I2V |
| **Voice & OCR Lab** | Text→speech across 6 providers, speech→text (Whisper), and image OCR |
| **Gallery** | Everything you have generated, with a lightbox and local persistence |
| **Workspace** | Notes and documents you attach so the model can read them as context |
| **Parameters** | Every Puter.js chat option, gated per model so you can see what is actually being sent |

---

## The three requested fixes

### 1. Clean typography

| Role | Font | Notes |
|---|---|---|
| Interface | **Geist** (default) | Swiss grotesque, variable 100–900 |
| Code | **Geist Mono** (default) | Used for code blocks, JSON, token counters, monospaced metadata |
| Alternate UI | **JetBrains Mono** | For a terminal-ish feel |
| Alternate code | **JetBrains Mono** | |
| Accents | Instrument Serif | Available for headings |

Fonts are loaded from Google Fonts and applied through CSS custom properties (`--font-sans`, `--font-mono`, `--font-code`), so **Interface font**, **Code font** and **Text size** are all switchable live under *Parameters → Appearance*. Tabular numerals, tightened display tracking and `font-feature-settings` are enabled for crisp numeric readouts.

### 2. Icons for rename / pin / delete

The row actions previously relied on `group-hover`, so on a touchscreen they were **permanently invisible**. They now:

- render always on touch devices via `@media (hover: none), (pointer: coarse)`, and on hover/focus with a mouse;
- include a **real Rename button** (pencil) — before, renaming was double-click-only, which is impossible on a phone;
- toggle between `Pin` / `PinOff` so the state is legible;
- carry `aria-label`s and are keyboard reachable.

```css
.row-actions { opacity: 0; }
.group:hover .row-actions, .group:focus-within .row-actions { opacity: 1; }
@media (hover: none), (pointer: coarse) { .row-actions { opacity: 1; } }
```

### 3. Custom dropdowns

Every native `<select>` was replaced with a hand-built `Select`:

- portal-rendered, so it is never clipped by a scrolling drawer;
- flips above the trigger when there is no room below;
- searchable, grouped, with descriptions and checkmarks;
- full keyboard support (`↑ ↓ Enter Esc Home End`, type-ahead search);
- animated open/close with the app's spring.

---

## Puter.js integration notes

The Puter surface was audited against <https://docs.puter.com/AI/chat/> and several real bugs were fixed:

- **Streamed images were dropped.** Image chunks arrive as `part.image` (`{ type: "image_url", image_url: { url } }`) while streaming; the old code only read `message.images` from non-streaming responses, so image models appeared to return nothing.
- **`compaction` was stored but never replayed.** The artifact is now carried forward as the first block of the assistant turn that produced it, and the history window restarts there — the documented contract, which keeps long chats inside the context window.
- **`provider` pinning** — `puter.ai.listModelProviders()` populates a *Pinned provider* dropdown so a request can be forced to a specific vendor.
- **`testMode` is positional**, not an option: `puter.ai.chat(msgs, true, opts)`.
- **Error handling** now understands Puter's `network_error` / `request_timeout` codes and compaction's 50k-token floor, instead of showing a raw stack.
- **Parameter gating** (`checkParams`) reflects Puter's real rules — e.g. GPT-6 Astra / Sol / Codex never receive `temperature`, `verbosity` and `reasoning_effort` are OpenAI-only, `thinking` is Claude-only. Unsupported params are omitted and labelled in the UI rather than sent and ignored.

---

## Mobile-app behaviour

- Bottom **tab bar** (Chat / Image / Video / Voice / Gallery) with a sliding indicator
- **Edge-swipe** from the left border to open the sidebar; the sidebar itself is drag-to-dismiss
- **Bottom sheets** with a grabber and drag-down-to-dismiss (drag is bound to the handle only, so it never fights inner scrolling)
- `env(safe-area-inset-*)` padding on the top bar, composer and tab bar; `100dvh` shell; `overscroll-behavior: none`; no tap highlight
- Autoscroll only while you are already at the bottom, plus a floating *scroll to latest* button

## Keyboard shortcuts

`⌘K` model picker · `⌘⇧O` new chat · `⌘/` parameters · `⌘B` sidebar · `Esc` close overlay

## Accessibility & motion

Springs respect `prefers-reduced-motion` and the in-app *Reduce motion* toggle (via framer-motion's `MotionConfig`). Controls have `aria-label`s, roles and `aria-expanded`/`aria-selected` state; focus rings are theme-aware.

## Architecture

```
src/
├── App.tsx                 shell, send loop, shortcuts, theme/font wiring
├── components/
│   ├── ui.tsx              Select, Sheet, Toggle, Slider, Seg, Field, Chip…
│   ├── Sidebars.tsx        chat sidebar, settings drawer, workspace drawer
│   ├── ChatView.tsx        markdown, code blocks, thinking, tools, actions
│   ├── Composer.tsx        input shell, attachments, drag & drop, mic
│   ├── ModelPicker.tsx     searchable model sheet + top-bar trigger
│   ├── StudioViews.tsx     Image / Video / Voice labs
│   └── Gallery.tsx         generated media grid + lightbox
├── lib/
│   ├── puter.ts            loader, model catalog, capability checks, chunk helpers
│   └── store.ts            types, defaults, localStorage persistence
├── index.css               design tokens, animations, markdown + composer styling
└── utils/cn.ts
```

## Testing

`npm run smoke` boots the built bundle in jsdom and drives the real UI in both desktop and phone layouts — 35 assertions covering mount, navigation, every overlay, custom dropdown open/close/keyboard, theme switching and composer input. Any runtime exception or React warning fails the run.
