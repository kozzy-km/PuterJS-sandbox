/**
 * Headless smoke test.
 *
 * Boots the built single-file bundle inside jsdom with the handful of browser
 * APIs jsdom lacks (matchMedia, ResizeObserver, IntersectionObserver), then
 * walks the real UI: opens the sidebar, model picker, settings + workspace
 * drawers, switches views, opens a custom dropdown and types a message.
 *
 * Any runtime exception, React warning or unhandled rejection fails the run.
 *
 *   node scripts/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

let html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

// jsdom cannot execute ESM, and vite-plugin-singlefile parks the inlined
// bundle in <head>. Downgrade it to a classic script, shim import.meta, and
// move it to the end of <body> so #root exists by the time it runs (an inline
// classic script ignores `defer`, unlike the original module script).
html = html.replace(/<script src="https:\/\/js\.puter\.com[^>]*><\/script>/g, "");
const bundleMatch = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
if (!bundleMatch) throw new Error("could not find the inlined bundle in dist/index.html");
const bundle = bundleMatch[1].replace(/import\.meta/g, '({url:"http://localhost:5173/",env:{}})');
// NOTE: the replacement must be a function — a string replacement would
// interpret `$$` in the bundle (React's $$typeof) as an escape for a literal `$`.
html = html
  .replace(bundleMatch[0], "")
  .replace("</body>", () => `<script>${bundle}</script></body>`);

const PHONE = process.env.SMOKE_PHONE === "1";
const problems = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => problems.push(`jsdomError: ${e.message}`));
vc.on("error", (...a) => problems.push(`console.error: ${a.join(" ")}`));
vc.on("warn", (...a) => {
  const msg = a.join(" ");
  // jsdom cannot lay out or resolve the external Puter/font requests; ignore those.
  if (/Could not parse CSS|Not implemented|cssRules|js\.puter\.com|fonts\.googleapis/i.test(msg)) return;
  problems.push(`console.warn: ${msg}`);
});

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost:5173/",
  virtualConsole: vc,
  resources: undefined, // never fetch external <script>/<link>
  // Polyfills must exist BEFORE the bundle executes.
  beforeParse(w) {
    w.matchMedia = (q) => ({
      // SMOKE_PHONE=1 answers "is this a phone?" with yes.
      matches: /max-width:\s*767px/.test(q) ? PHONE : false,
      media: q, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    });
    class RO { observe() {} unobserve() {} disconnect() {} }
    class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
    w.ResizeObserver = RO;
    w.IntersectionObserver = IO;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.Element.prototype.scrollTo = function () {};
    w.requestIdleCallback ??= (cb) => setTimeout(cb, 0);
    w.cancelIdleCallback ??= clearTimeout;
    for (const m of ["releasePointerCapture", "setPointerCapture"]) {
      w.HTMLElement.prototype[m] ??= function () {};
    }
    w.HTMLElement.prototype.hasPointerCapture ??= () => false;
    // framer-motion probes the Web Animations API.
    if (!w.Element.prototype.animate) {
      w.Element.prototype.animate = () => ({
        finished: Promise.resolve(), currentTime: 0, playState: "finished",
        cancel() {}, play() {}, pause() {}, finish() {}, commitStyles() {},
        addEventListener() {}, removeEventListener() {},
      });
    }
    w.PointerEvent ??= w.MouseEvent;
    w.process = { env: { NODE_ENV: "production" } };
  },
});

const { window } = dom;
const { document } = window;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => $("#root")?.textContent ?? "";
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/** Click the first element whose accessible text/label matches. */
function clickText(needle, tag = "button") {
  const el = $$(tag).find((e) =>
    (e.textContent || "").trim().toLowerCase().includes(needle.toLowerCase()) ||
    (e.getAttribute("aria-label") || "").toLowerCase().includes(needle.toLowerCase()) ||
    (e.getAttribute("title") || "").toLowerCase().includes(needle.toLowerCase()));
  if (!el) throw new Error(`no <${tag}> matching "${needle}"`);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  return el;
}
function press(key, target = document) {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
function type(sel, value) {
  const el = $(sel);
  if (!el) throw new Error(`no element ${sel}`);
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc.set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
  return el;
}

const checks = [];
function expect(name, cond, extra = "") {
  checks.push({ name, ok: !!cond, extra });
  if (!cond) problems.push(`assertion failed: ${name} ${extra}`);
}

(async () => {
  await sleep(1200); // let React mount + effects run

  /* ── 1. shell ── */
  expect("app mounts", !!$("#root")?.childElementCount, `children=${$("#root")?.childElementCount}`);
  expect("brand renders", text().includes("NEXUS"));
  expect("welcome heading", text().toLowerCase().includes("explore today"));
  expect("starter cards", $$("button").some((b) => (b.textContent || "").includes("Explain a concept")));
  expect("boot splash removed", !$("#boot"));
  expect("dark class applied", document.documentElement.classList.contains("dark"));
  expect("composer present", !!$("textarea"));

  /* ── 2. sidebar (desktop rail is rendered) ── */
  const rail = $("aside");
  expect("sidebar rail", !!rail);
  const kebab = $('[aria-label^="Actions for"]');
  expect("chat row kebab menu", !!kebab, "row action button rendered");
  if (kebab) {
    kebab.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(350);
    expect("kebab menu items",
      text().includes("Pin") && text().includes("Rename") && text().includes("Delete"));
    kebab.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(350);
  }
  expect("sidebar search + actions",
    !!$('input[aria-label="Search chats"]') &&
    $$('[aria-label="New chat"]').length > 0 &&
    $$('[aria-label="Workspace files"]').length > 0);

  /* ── 3. custom dropdown, not <select> ── */
  expect("no native selects", $$("select").length === 0, `found ${$$("select").length}`);

  /* ── 4. model picker (trigger shows the current model name) ── */
  clickText("GPT-5.4 Nano", "button");
  await sleep(500);
  expect("model picker open", text().includes("Choose a model") && $("input[placeholder*='Search gpt']"));
  expect("model rows", $$("button").some((b) => (b.textContent || "").includes("GPT-6 Astra")));
  press("Escape", document);
  await sleep(450);

  /* ── 5. settings drawer → assert every control is a custom Select ── */
  clickText("Parameters", "button");
  await sleep(600);
  expect("settings open", text().includes("Settings"));
  expect("settings grouped sections",
    text().includes("Model & output") && text().includes("Capabilities") && text().includes("Behaviour & transport"));
  expect("settings: no native selects", $$("select").length === 0, `found ${$$("select").length}`);
  const modelSelectTrigger = $$('[aria-haspopup="listbox"]').find((b) => (b.textContent || "").includes("GPT-5.4 Nano"));
  expect("model Select trigger", !!modelSelectTrigger);
  if (modelSelectTrigger) {
    modelSelectTrigger.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    modelSelectTrigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await sleep(350);
    expect("dropdown popover opens", $$('[role="listbox"]').length > 0);
    expect("dropdown has options", $$('[role="option"]').length > 3, `options=${$$('[role="option"]').length}`);
    press("Escape", document);
    await sleep(300);
    expect("dropdown closes on Escape", $$('[role="listbox"]').length === 0);
  }
  expect("appearance section", text().includes("Interface font"));
  expect("shortcuts block", text().includes("Shortcuts"));
  press("Escape", document);
  await sleep(450);

  /* ── 6. workspace drawer ── */
  clickText("Files", "button");
  await sleep(600);
  expect("workspace open", text().includes("Workspace") && (text().includes("No files yet") || text().includes("Export workspace JSON")));
  press("Escape", document);
  await sleep(450);

  /* ── 7. keyboard shortcut ⌘K ── */
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  await sleep(500);
  expect("cmd-K opens picker", text().includes("Choose a model"));
  press("Escape", document);
  await sleep(400);

  /* ── 8. studio views ── */
  for (const [label, marker] of [["Image", "Image Lab"], ["Video", "Video Lab"], ["Voice", "OCR"], ["Gallery", "Gallery"]]) {
    clickText(label, "button");
    await sleep(420);
    expect(`view: ${label}`, text().includes(marker), `missing "${marker}"`);
  }
  expect("gallery has no native selects", $$("select").length === 0);

  /* ── 8b. phone-only affordances ── */
  if (PHONE) {
    expect("bottom tab bar renders", $$("nav").some((n) =>
      ["Chat", "Image", "Video", "Voice", "Gallery"].every((l) => (n.textContent || "").includes(l))));
    clickText("Parameters", "button");
    await sleep(600);
    expect("settings is a bottom sheet",
      $$("div").some((d) => (d.className || "").toString().includes("cursor-grab")),
      "drag grabber present");
    expect("sheet drag wired",
      $$("div").some((d) => (d.className || "").toString().includes("touch-none")));
    press("Escape", document);
    await sleep(450);
  }

  /* ── 9. back to chat, type a message ── */
  clickText("Chat", "button");
  await sleep(420);
  const ta = $("textarea");
  type("textarea", "Hello from the smoke test");
  await sleep(200);
  expect("composer accepts input", ta.value.includes("smoke test"), `value="${ta.value}"`);
  expect("send enabled", $$('[aria-label="Send message"]').some((b) => !b.disabled));

  /* ── 10. light theme flips tokens ── */
  const root = document.documentElement;
  if (process.env.SMOKE_DEBUG) {
    console.log("BUTTONS:", $$("button").map((b) => JSON.stringify({
      t: (b.textContent || "").trim().slice(0, 28),
      a: b.getAttribute("aria-label"),
      ti: b.getAttribute("title"),
    })).join("\n"));
    console.log("ASIDES:", $$("aside").length, "TEXTLEN:", text().length);
  }
  clickText("Parameters", "button");
  await sleep(500);
  clickText("Light", "button");
  await sleep(400);
  expect("light class applied", root.classList.contains("light"));
  expect("dark class removed", !root.classList.contains("dark"));
  expect("color-scheme synced", root.style.colorScheme === "light", `got "${root.style.colorScheme}"`);
  press("Escape", document);
  await sleep(300);

  /* ── report ── */
  console.log("\n──────── smoke results ────────");
  for (const c of checks) {
    console.log(`${c.ok ? "  ✓" : "  ✗"} ${c.name}${!c.ok && c.extra ? `  (${c.extra})` : ""}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  if (problems.length) {
    console.log("\n──────── problems ────────");
    [...new Set(problems)].slice(0, 25).forEach((p) => console.log("  ! " + p));
  }
  process.exit(failed.length || problems.length ? 1 : 0);
})().catch((e) => {
  console.error("\nSMOKE CRASHED:", e);
  [...new Set(problems)].slice(0, 20).forEach((p) => console.log("  ! " + p));
  process.exit(1);
});
