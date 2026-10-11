import { accumulateToolCalls, resolveToolCalls, extractToolCalls, parseArgsSafe, toolInventory, isToolError } from "../node_modules/.cache/tools-test/tools.mjs";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name); } };

/* Unit tests for the local-tool plumbing in src/lib/tools.ts.
   Run with: npm run test:tools  (esbuild compiles the TS first).

   1. Puter-native streaming tool_use chunks (parsed input, complete per chunk) */
{
  const b = new Map();
  accumulateToolCalls(b, { type: "tool_use", id: "toolu_1", name: "workspace_list", input: { limit: 20 } });
  const calls = resolveToolCalls(b);
  ok("puter-native tool_use → 1 call with parsed input", calls.length === 1 && calls[0].args.limit === 20 && calls[0].name === "workspace_list");
}

/* 2. OpenAI-style streaming deltas: arguments arrive in fragments */
{
  const b = new Map();
  accumulateToolCalls(b, { index: 0, id: "call_a", function: { name: "workspace_write", arguments: '{"name":"te' } });
  accumulateToolCalls(b, { index: 0, function: { name: "workspace_write", arguments: 'st.md","content":"hi"}' } });
  const calls = resolveToolCalls(b);
  ok("openai deltas merged into one call", calls.length === 1);
  ok("merged args parse correctly", calls[0].name === "workspace_write" && calls[0].args.name === "test.md" && calls[0].args.content === "hi");
}

/* 3. Two parallel calls in deltas must not collapse */
{
  const b = new Map();
  accumulateToolCalls(b, { index: 0, id: "c1", function: { name: "calculator", arguments: '{"expression":"1+1"}' } });
  accumulateToolCalls(b, { index: 1, id: "c2", function: { name: "get_datetime", arguments: "{}" } });
  const calls = resolveToolCalls(b);
  ok("parallel calls kept separate", calls.length === 2 && calls[0].name === "calculator" && calls[1].name === "get_datetime");
}

/* 4. Name in fragments (name appears only in the first fragment) */
{
  const b = new Map();
  accumulateToolCalls(b, { index: 0, function: { name: "workspace_lookup", arguments: "" } });
  accumulateToolCalls(b, { index: 0, function: { arguments: '{"query":"notes"}' } });
  const calls = resolveToolCalls(b);
  ok("name survives later argument-only deltas", calls[0].name === "workspace_lookup" && calls[0].args.query === "notes");
}

/* 5. Anthropic-native non-streaming shape */
{
  const calls = extractToolCalls({ content: [{ type: "text", text: "let me look" }, { type: "tool_use", id: "toolu_9", name: "workspace_list", input: {} }] }, {});
  ok("anthropic content blocks → tool call", calls.length === 1 && calls[0].name === "workspace_list");
}

/* 6. OpenAI non-streaming shape + duplicate suppression */
{
  const msg = { tool_calls: [
    { id: "a", function: { name: "workspace_list", arguments: "{}" } },
    { id: "b", function: { name: "workspace_list", arguments: "{}" } },
  ] };
  const calls = extractToolCalls(msg, {});
  ok("duplicate identical calls collapse", calls.length === 1 && calls[0].args && Object.keys(calls[0].args).length === 0);
}

/* 7. Truncated JSON never throws */
{
  const calls = extractToolCalls({ tool_calls: [{ id: "x", function: { name: "workspace_write", arguments: '{"name":"a.md","cont' } }] }, {});
  ok("truncated args degrade to {}", calls.length === 1 && JSON.stringify(calls[0].args) === "{}");
}

/* 8. Inventories + error detection */
{
  const inv = toolInventory([
    { type: "web_search" },
    { type: "function", function: { name: "workspace_list" } },
    { type: "function", function: { name: "workspace_lookup" } },
  ]);
  ok("inventory lists real tool names", inv.includes("web_search") && inv.includes("workspace_list"));
  ok("inventory explains lookup is content-only", inv.includes("never matches file names"));
  ok("empty inventory is explicit", toolInventory([]).includes("No tools"));
  ok("tool errors detected", isToolError("workspace_write error: name is required") && !isToolError("OK — wrote test.md (71 chars)."));
  ok("partial json handled", JSON.stringify(parseArgsSafe("{oops")) === "{}");
}

console.log(`\n${pass}/${pass + fail} helper checks passed`);
process.exit(fail ? 1 : 0);
