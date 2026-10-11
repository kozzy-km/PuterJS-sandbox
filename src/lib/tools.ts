/* ─── Local-tool plumbing ────────────────────────────────────────────────
   Providers hand tool calls back in several shapes, and while streaming they
   arrive as deltas that must be merged before the arguments can be parsed.
   These helpers normalise all of them so a tool never silently runs with `{}`
   arguments (which is how `workspace_list`/`workspace_write` "failed").
   Kept free of React imports so the logic is unit-testable. */

export interface PendingTool { id?: string; name: string; argsText: string; parsed?: any }
export type PendingToolBucket = Map<string, PendingTool>;

/** Tool semantics, echoed into the system prompt so the model can't guess wrong. */
export const TOOL_HINTS: Record<string, string> = {
  calculator: "evaluates an arithmetic expression exactly",
  get_datetime: "returns the current local date/time",
  workspace_lookup:
    "searches the TEXT INSIDE workspace files. It is a content search: it never matches file names and \"*\" is NOT a wildcard",
  workspace_list:
    "lists EVERY workspace file with its name, format, size and attached flag. Use this first whenever the user asks what is in the workspace",
  workspace_read:
    "reads a single workspace file by name (paginated with offset/limit). Use after workspace_list to get content",
  workspace_write: "creates or updates a workspace file (the user sees it and can attach it)",
  workspace_edit:
    "surgical edit: replaces exact old_text with new_text inside a file (more token-efficient than rewriting the whole file)",
  workspace_delete: "deletes a workspace file by name",
  workspace_rename: "renames a workspace file (old_name → new_name)",
  workspace_run:
    "executes JavaScript from a string or a workspace .js file in a sandboxed terminal; returns console output. Can read/write workspace via `workspace` helper",
  workspace_fetch:
    "downloads a URL and saves it as a workspace file (supports text, JSON, images; auto-saves and returns status)",
  fetch_url_text: "downloads a public URL and returns it as plain text (read-only, does not save)",
  web_search: "native provider-run web search",
};

/** The definitive tool list for this turn — injected into the system prompt so
 * the model always knows exactly what it has (models otherwise repeat a stale
 * inventory they wrote earlier in the chat and claim a tool "isn't available"). */
export function toolInventory(tools: any[]): string {
  const names = tools
    .map((t: any) => t?.function?.name ?? t?.type)
    .filter((n: any): n is string => typeof n === "string");
  if (!names.length) return "No tools are enabled this turn.";
  return names.map((n) => `- ${n}: ${TOOL_HINTS[n] ?? "utility tool"}`).join("\n");
}

/** Merge one stream chunk's tool-call payload(s) into the turn's accumulator. */
export function accumulateToolCalls(bucket: PendingToolBucket, part: any) {
  const list: any[] = [];
  if (Array.isArray(part?.tool_calls)) list.push(...part.tool_calls);
  else if (Array.isArray(part?.toolCalls)) list.push(...part.toolCalls);
  else if (Array.isArray(part?.message?.tool_calls)) list.push(...part.message.tool_calls);
  // Puter's normalised `tool_use` chunk, or a bare call object (some providers
  // put the name/arguments at the top level of the delta instead of in an array).
  if (part?.type === "tool_use" || part?.type === "tool_call") list.push(part);
  else if (part?.function || part?.name) list.push(part);

  for (const raw of list) {
    if (!raw) continue;
    const index = typeof raw.index === "number" ? raw.index : undefined;
    const id = raw.id || raw.tool_call_id;
    // OpenAI-style deltas identify a call by `index` (the id only rides along in
    // the first fragment), so index wins; mixing both used to split a single
    // call into two buckets and drop every argument fragment after the first.
    let key = index !== undefined ? `#${index}` : id ? String(id) : `slot-${bucket.size}`;
    if (!bucket.has(key) && id) {
      for (const [k, v] of bucket) { if (v.id === String(id)) { key = k; break; } }
    }
    const prev: PendingTool = bucket.get(key) ?? { id: id ? String(id) : undefined, name: "", argsText: "" };
    const name = raw?.function?.name || raw?.name || "";
    // Deltas repeat the name; keep the most complete spelling we have seen.
    if (name && name !== prev.name) prev.name = name.length >= prev.name.length ? name : prev.name;
    if (typeof raw?.function?.arguments === "string") prev.argsText += raw.function.arguments;
    else if (raw?.input !== undefined) prev.parsed = raw.input;
    else if (raw?.args !== undefined) prev.parsed = raw.args;
    if (!prev.id && id) prev.id = String(id);
    bucket.set(key, prev);
  }
}

/** Turn an accumulated bucket into ready-to-run calls. */
export function resolveToolCalls(bucket: PendingToolBucket): { id?: string; name: string; args: any }[] {
  return [...bucket.values()]
    .map((c) => ({ id: c.id, name: c.name, args: c.parsed !== undefined ? c.parsed : parseArgsSafe(c.argsText) }))
    .filter((c) => c.name);
}

export function parseArgsSafe(text: string): any {
  const raw = (text || "").trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : { value: v };
  } catch {
    return {}; // truncated/partial JSON — better an empty call than a crash
  }
}

/** Non-streaming replies: accept OpenAI `tool_calls` and Anthropic-style
 * `content: [{ type: "tool_use" }]` blocks. */
export function extractToolCalls(msg: any, res: any): { id?: string; name: string; args: any }[] {
  const raw: any[] = [];
  const pushAll = (v: any) => { if (Array.isArray(v)) raw.push(...v); };
  pushAll(msg?.tool_calls);
  pushAll(msg?.toolCalls);
  pushAll(res?.tool_calls);
  const blocks: any[] = Array.isArray(msg?.content) ? msg.content : Array.isArray(res?.content) ? res.content : [];
  for (const b of blocks) {
    if (b && (b.type === "tool_use" || b.type === "tool_call")) {
      raw.push({
        id: b.id,
        name: b.name,
        function: { name: b.name, arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {}) },
      });
    }
  }
  const seen = new Set<string>();
  const out: { id?: string; name: string; args: any }[] = [];
  for (const r of raw) {
    const name = r?.function?.name || r?.name;
    if (!name) continue;
    const args = r?.input !== undefined ? r.input
      : r?.args !== undefined ? r.args
      : typeof r?.function?.arguments === "string" ? parseArgsSafe(r.function.arguments) : {};
    const fp = `${name}:${JSON.stringify(args)}`;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push({ id: r?.id || r?.tool_call_id, name, args });
  }
  return out;
}

/** Tools report failures as prefixed text; surface them as error rows. */
export const isToolError = (result: string) =>
  /^(calc error|workspace_(write|read|edit|delete|rename|run|fetch) error|fetch_url_text error|unknown tool)/i.test(result.trim());
