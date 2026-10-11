/* ═══════════════════════════════════════════════════════════════════
   Tiny syntax highlighter — no dependency, ~2 KB.

   Tokenises a code string with one combined regex per language family
   and returns HTML with `tk-*` spans (themed in index.css, dark+light).
   Unknown languages are returned escaped and uncoloured.
   ═══════════════════════════════════════════════════════════════════ */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Rule = [cls: string, re: string];

const KW = (words: string) => `\\b(?:${words})\\b`;

/* comment / string fragments shared across families */
const C_LINE = `\\/\\/[^\\n]*`;
const C_HASH = `#[^\\n]*`;
const C_BLOCK = `\\/\\*[\\s\\S]*?(?:\\*\\/|$)`;
const C_HTML = `<!--[\\s\\S]*?(?:-->|$)`;
const S_COMMON = `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'`;
const S_BACKTICK = "`(?:\\\\.|[^`\\\\])*`";
const NUM = `\\b0[xXbBoO][0-9a-fA-F_]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b`;

interface Gram {
  rules: Rule[];
  kw?: string;
  lit?: string;
  types?: string;
}

const JS_KW = "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|import|export|from|default|delete|void|static|get|set|interface|type|enum|implements|declare|namespace|abstract|as|satisfies|keyof|readonly";
const JS_LIT = "true|false|null|undefined|NaN|Infinity";
const PY_KW = "def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|del|in|is|not|and|or|async|await|match|case";
const PY_LIT = "True|False|None|self|cls|Ellipsis";
const C_KW = "int|long|float|double|char|void|bool|struct|class|public|private|protected|static|const|constexpr|template|typename|namespace|using|return|if|else|for|while|do|switch|case|break|continue|new|delete|try|catch|throw|virtual|override|final|auto|sizeof|nullptr|include|define|ifdef|endif|pragma";
const C_LIT = "true|false|NULL|nullptr|None";
const GO_KW = "func|package|import|return|if|else|for|range|switch|case|break|continue|go|defer|chan|map|struct|interface|type|var|const|select|default|fallthrough|goto";
const RUST_KW = "fn|let|mut|const|static|struct|enum|impl|trait|pub|use|mod|crate|match|if|else|for|while|loop|break|continue|return|async|await|move|ref|where|type|dyn|unsafe|self|super";
const SH_KW = "if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|export|local|readonly|shift|source|echo|cd|sudo|apt|npm|npx|git|curl|pip|python|node";
const SQL_KW = "select|from|where|insert|into|values|update|set|delete|create|table|drop|alter|add|join|left|right|inner|outer|on|group|by|order|having|limit|offset|union|all|distinct|as|and|or|not|null|primary|key|foreign|references|index|view|begin|commit|rollback|case|when|then|else|end|exists|between|like|is";

const GRAMMARS: Record<string, Gram> = {
  js: {
    kw: JS_KW, lit: JS_LIT, types: "string|number|boolean|any|unknown|never|void|object|symbol|bigint|Promise|Array|Record|Partial|Readonly",
    rules: [
      ["c", C_LINE], ["c", C_BLOCK], ["s", S_BACKTICK], ["s", S_COMMON], ["n", NUM],
      ["f", `[A-Za-z_$][\\w$]*(?=\\s*\\()`], ["t", "\\b[A-Z][\\w]*\\b"], ["o", `=>|===|!==|&&|\\|\\||[+\\-*/%=<>!&|^~?:]+`],
    ],
  },
  py: {
    kw: PY_KW, lit: PY_LIT, types: "int|float|str|bool|list|dict|set|tuple|bytes|None|Optional|Union|Any",
    rules: [
      ["c", C_HASH], ["s", `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''`], ["s", S_COMMON], ["n", NUM],
      ["f", `[A-Za-z_][\\w]*(?=\\s*\\()`], ["t", "\\b[A-Z][\\w]*\\b"], ["o", `[+\\-*/%=<>!&|^~@:]+`],
    ],
  },
  sh: {
    kw: SH_KW, lit: "true|false",
    rules: [["c", C_HASH], ["s", S_COMMON], ["n", NUM], ["v", `\\$\\{?[\\w@#?*]+\\}?`], ["f", `[A-Za-z_.][\\w.-]*(?=\\s)`], ["o", `\\|\\||&&|[|<>!;]+`]],
  },
  json: {
    lit: "true|false|null",
    rules: [["s", `"(?:\\\\.|[^"\\\\])*"(?=\\s*:)`], ["s", S_COMMON], ["n", NUM], ["o", `[{}\\[\\],:]+`]],
  },
  css: {
    kw: "import|media|supports|keyframes|layer|theme|font-face|page|container",
    rules: [["c", C_BLOCK], ["s", S_COMMON], ["n", NUM], ["t", `[.#][\\w-]+|::?[a-z-]+`], ["f", `[a-z-]+(?=\\s*:)`], ["o", `[{}();:,>+~*]+`]],
  },
  html: {
    rules: [["c", C_HTML], ["s", S_COMMON], ["t", `</?[\\w-]+|/?>`], ["f", `[\\w-]+(?==)`], ["n", NUM]],
  },
  sql: { kw: SQL_KW, lit: "null|true|false", rules: [["c", `--[^\\n]*|/\\*[\\s\\S]*?(?:\\*/|$)`], ["s", S_COMMON], ["n", NUM], ["o", `[=<>!+\\-*/%,();]+`]] },
  c: { kw: C_KW, lit: C_LIT, rules: [["c", C_LINE], ["c", C_BLOCK], ["s", S_COMMON], ["n", NUM], ["f", `[A-Za-z_][\\w]*(?=\\s*\\()`], ["t", "\\b[A-Z][\\w]*\\b|\\b[uif](?:8|16|32|64)\\b"], ["o", `->|::|[+\\-*/%=<>!&|^~?:]+`]] },
  go: { kw: GO_KW, lit: "true|false|nil|iota", types: "string|int|int64|float64|bool|byte|rune|error|any", rules: [["c", C_LINE], ["s", S_BACKTICK], ["s", S_COMMON], ["n", NUM], ["f", `[A-Za-z_][\\w]*(?=\\s*\\()`], ["t", "\\b[A-Z][\\w]*\\b"], ["o", `:=|<-|[+\\-*/%=<>!&|^~?:]+`]] },
  rust: { kw: RUST_KW, lit: "true|false|Some|None|Ok|Err", rules: [["c", C_LINE], ["s", S_COMMON], ["n", NUM], ["f", `[A-Za-z_][\\w]*(?=\\s*!?\\s*\\()`], ["t", "\\b[A-Z][\\w]*\\b"], ["m", `'[a-z_]+\\b`], ["o", `=>|->|[+\\-*/%=<>!&|^~?:]+`]] },
  yaml: {
    lit: "true|false|null|yes|no",
    rules: [["c", C_HASH], ["s", S_COMMON], ["n", NUM], ["f", `^[ \\-]*[\\w.-]+(?=:)`], ["o", `[:\\-]+`]],
  },
  md: {
    rules: [["c", `<!--[\\s\\S]*?-->`], ["k", `^#{1,6}[^\\n]*`], ["s", "`[^`\\n]*`"], ["f", `\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__`], ["t", `^\\s*(?:[-*+]|\\d+\\.)\\s`], ["n", NUM]],
  },
  lua: {
    kw: "local|function|end|if|then|else|elseif|for|while|do|return|break|repeat|until|in|and|or|not|goto",
    lit: "true|false|nil",
    rules: [["c", `--\\[\\[[\\s\\S]*?(?:\\]\\]|$)|--[^\\n]*`], ["s", S_COMMON], ["n", NUM], ["f", `[A-Za-z_][\\w]*(?=\\s*\\()`], ["o", `\\.\\.|[+\\-*/%=<>#~:]+`]],
  },
};

/* alias map → grammar key */
const ALIAS: Record<string, string> = {
  javascript: "js", jsx: "js", ts: "js", tsx: "js", typescript: "js", mjs: "js", cjs: "js", vue: "html",
  python: "py", python3: "py", bash: "sh", shell: "sh", zsh: "sh", console: "sh", sh: "sh",
  yml: "yaml", toml: "yaml", ini: "yaml",
  htm: "html", xml: "html", svg: "html",
  cpp: "c", "c++": "c", cc: "c", hh: "c", hpp: "c", h: "c", csharp: "c", cs: "c", java: "c", kotlin: "c", kt: "c", swift: "c", php: "c",
  golang: "go", rs: "rust", rb: "lua", ruby: "lua",
  markdown: "md", diff: "md", patch: "md",
};

export function highlightLang(lang: string): string | null {
  const l = (lang || "").toLowerCase();
  const key = GRAMMARS[l] ? l : ALIAS[l] ?? null;
  return key;
}

const CLS: Record<string, string> = {
  c: "tk-c", s: "tk-s", n: "tk-n", f: "tk-f", t: "tk-t", o: "tk-o",
  v: "tk-v", k: "tk-k", m: "tk-l", kw: "tk-k", lit: "tk-l", ty: "tk-t",
};

/** Returns HTML (already escaped) with `<span class="tk-*">` tokens. */
export function highlight(code: string, lang: string): string {
  const key = highlightLang(lang);
  if (!key) return esc(code);
  const g = GRAMMARS[key];

  // One alternation of *numbered* groups (named groups must be unique and
  // several rules share a class, e.g. two string flavours). Order matters:
  // comments/strings/numbers first, then keywords/literals/types, and only
  // then function-call / Type / operator shapes — so `if (` is a keyword and
  // `True` a literal, not a "function" or a "type".
  const PRE = new Set(["c", "s", "n", "v", "k", "m"]);
  const specs: [cls: string, re: string][] = [];
  for (const r of g.rules) if (PRE.has(r[0])) specs.push(r);
  if (g.kw) specs.push(["kw", KW(g.kw)]);
  if (g.lit) specs.push(["lit", KW(g.lit)]);
  if (g.types) specs.push(["ty", KW(g.types)]);
  for (const r of g.rules) if (!PRE.has(r[0])) specs.push(r);

  let re: RegExp;
  try { re = new RegExp(specs.map(([, r]) => `(${r})`).join("|"), "gm"); }
  catch { return esc(code); }

  let out = "";
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out += esc(code.slice(last, i));
    let cls = "";
    for (let k = 1; k < m.length; k++) {
      if (m[k] !== undefined) { cls = CLS[specs[k - 1][0]] || ""; break; }
    }
    out += cls ? `<span class="${cls}">${esc(m[0])}</span>` : esc(m[0]);
    last = i + m[0].length;
    if (m[0].length === 0) last++; // safety: never loop forever
  }
  out += esc(code.slice(last));
  return out;
}
