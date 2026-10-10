# WP-001 — pi 0.83 → 1.0 extension-API drift audit and integration strategy

Status: **audit complete 2026-10-10 — decision D6 recorded in DECISIONS.md.**

## Why this is first

Little Coder v1.20.0's entire capability set is its ~36 pi extensions, authored against pi **^0.83.0** (per its package.json). This fork embeds pi **1.0.0** (per package.json + installed node_modules). Nothing else in the shrink can be planned responsibly until we know exactly what changed between those extension APIs, which retained extensions survive as-is, and how the harness capability is delivered in-process.

## Audit method (executed)

1. Published copy of pi **0.83.0** fetched (`npm pack @earendil-works/pi-coding-agent@0.83.0`); its `dist/core/extensions/types.d.ts` diffed line-by-line against the fork's installed pi 1.0.0 typings.
2. All 16 retained extensions (+ the 7 `_shared` modules) copied to a probe tree and compiled with `tsc --strict` against pi 1.0.0's typings (`@earendil-works/pi-coding-agent` resolved from this fork's node_modules).
3. End-to-end probe (`work-packages/WP-001-probe/`): the real `write-guard/index.ts` + `_shared/` loaded as an inline `extensionFactories` entry through pi 1.0.0's SDK (`createAgentSession` + `DefaultResourceLoader` + `ModelRuntime`), against a scripted fake OpenAI-compatible server on localhost.

## API diff: pi 0.83.0 → 1.0.0 `ExtensionAPI` (evidence: source diff of the two packages' `dist/core/extensions/types.d.ts`)

Events ADDED in 1.0.0 (superset — nothing was removed):

- `agent_before_settle` (with boundary-draft result shape; replaces ad-hoc settlement writes)
- `cache_warming_decision`
- `context_with_system` (post-`context` pass where the handler owns the system prompt)
- `mcp_servers_change`
- `provider_stream_event`
- `session_compact_failed`
- `ui_prompt_start` / `ui_prompt_end`

Event SHAPES changed (backward-relevant):

- `turn_end`: 0.83 `{turnIndex, message, toolResults}` → 1.0 adds `messageEntryId`, `toolResultEntryIds`, and a `BoundaryResult` return (entries/continue). The retained extensions that only _read_ `turn_end` (quality-monitor, output-parser) are unaffected.
- `before_agent_start`: `systemPromptOptions` type widened (`NormalizedBuildSystemPromptOptions` in 1.0 vs `BuildSystemPromptOptions` in 0.83); the return shape (`message` + optional `systemPrompt` override) is the same. `_shared/inject.ts` relies on exactly this, unchanged.
- `tool_call` / `tool_result`: gain `parentToolCallId` (nested codemode calls); new `terminate?: boolean` in the `tool_call` result. `write-guard`'s `{block: true, reason}` contract is unchanged.
- `TurnEndEventResult`/`AgentBeforeSettleEventResult` are new typed results — no impact on retained set (they don't return those).

`ExtensionAPI` methods: identical set in both versions for everything the retained extensions use (`registerTool`, `registerCommand`, `on`, `sendUserMessage`, `exec`, `getActiveTools`, `setActiveTools`, `registerProvider`, `getAllTools`). 1.0 _adds_ `registerMcpServer`, `registerVirtualModel`, `unregisterProvider`, `getSettings`, `getCommands` — no churn in what we call.

`ExtensionContext` (ctx): 1.0 adds `hasUI`, `mode: "tui"|"rpc"|"json"|"print"`, `getSystemPrompt()`, `shutdown()`, `getContextUsage()`, `compact()`, and keeps `signal`, `abort()`, `sessionManager`, `cwd` — all of which the retained set reads. The 0.83 ctx already had `ui` so nothing breaks.

`ProviderConfig` (`registerProvider`): 1.0 renames `streamSimple`'s `context` param type to `TranscriptContext`, widens `models` to `ProviderModelConfig` (with `type?: "chat"` normalization), adds `images`/`classifiers`/`refreshModels`. The retained `llama-cpp-provider/config.ts` shape (`baseUrl/key/api/models[{id,reasoning,input,cost,contextWindow,maxTokens,compat}]`) is unchanged — **which is what WP-002 will reuse for the single-provider registration.**

`InlineExtension`: 1.0 adds `builtin?: boolean` and `replaceable?: boolean`; the `{name, factory, hidden}` shape the fork already passes is valid in both.

## Per-extension port verdicts (all 16 retained + `_shared`, against pi 1.0.0)

| Extension            | Verdict                                        | Notes                                                                                                                                              |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write-guard`        | **ports clean**                                | strict-compile clean; end-to-end proven (see probe)                                                                                                |
| `read-guard`         | **ports clean**                                | trims at `tool_result`; no 1.0-only surface                                                                                                        |
| `read-guard-edit`    | **ports clean**                                | `session_start` + `tool_result` + `tool_call`                                                                                                      |
| `permission-gate`    | **ports clean**                                | `tool_call` + `ctx.ui.confirm` — GUI owns bindings (below)                                                                                         |
| `output-parser`      | **ports clean**                                | `turn_end` + `sendUserMessage(followUp)`                                                                                                           |
| `quality-monitor`    | **ports clean**                                | `turn_end` + `sendUserMessage(steer)`; DEPENDS on pi settings `little_coder.model_profiles` for budgets — see config note                          |
| `thinking-budget`    | **ports clean**                                | `message_update` + `ctx.abort()`; already tolerates SDK-without-sendUserMessage                                                                    |
| `context-watchdog`   | **ports clean**                                | `getContextUsage()`/`compact()` exist in 1.0; probe-verified members compiled                                                                      |
| `extra-tools`        | **ports clean**                                | registers glob/webfetch/websearch tools; only dep is `@sinclair/typebox` — pi 1.0.0 ships `typebox@1.3.27` (unscoped); import rewires to `typebox` |
| `skill-inject`       | **ports clean**                                | `before_agent_start` + `_shared/inject.ts` message-mode path                                                                                       |
| `knowledge-inject`   | **ports clean**                                | same hook, no drift                                                                                                                                |
| `project-context`    | **ports clean**                                | `before_agent_start` injection                                                                                                                     |
| `checkpoint`         | **ports clean**                                | `tool_call` block/pre-write hook, pure fs                                                                                                          |
| `clear-command`      | **ports clean**                                | `registerCommand("clear")` → `ctx.newSession()` (ExtensionCommandContext unchanged)                                                                |
| `extensions-info`    | **ports clean**                                | `session_start` widget + `/extensions` command; env-manifest degenerate list                                                                       |
| `llama-cpp-provider` | **ports clean (with one drift-relevant note)** | `registerProvider` shape unchanged — verified; the `model_select` re-probe hook uses the same event/`ctx.ui.notify` unchanged                      |

`_shared/`: all 7 modules (inject, intervention, safe-ctx, shell-write, width, allowed-tools, skills-root) compile strict-clean against 1.0.0 — good; the two upstream test-fences (`inject-usage.test.ts`, `shell-write.test.ts`) port to the fork's test runner unchanged in behavior (they are pure-file tests over the same modules).

Only transpilation-level changes needed (not drift, just packaging):

1. `.ts` extension imports with explicit `.ts` specifiers work out of the box with tsx-style loaders; the fork's driver already compiles these to inline factories, so they'll be built by the bundler rather than loaded raw by `node`.
2. `@sinclair/typebox` → `typebox` (pi 1.0.0 shipped the unscoped package; same API).
3. `extensions-info`'s env-manifest degenerate list is a fork-constant rather than an env var (already spec'd in TECHNICAL-SPEC §3).

## `ExtensionAPI` diff conclusion

**The retained extension set is a strict subset of the 0.83 API that survives unchanged in 1.0.0.** Every event the retained set subscribes to exists in 1.0.0 with a compatible (equal or widened) payload shape; every `ExtensionAPI` method the retained set calls exists in 1.0.0. There is no drift in the harness path — the drift is all in _additions_ (settlement boundaries, provider-stream visibility, UI-prompt events) which we are free to ignore or later adopt (e.g. `agent_before_settle` could serve quality-monitor's "one provider request" steering more precisely than the current `turn_end` hook, but that is an optimization, not a requirement).

## Integration strategy (Decision D6 in DECISIONS.md)

**Chosen: candidate (a) — port the retained little-coder extensions as fork inline factories against pi 1.0.0.** The probe proves one real extension (`write-guard`, byte-for-byte with its `_shared` dependency) compiles, loads through `extensionFactories`, receives the model's tool call, blocks it, and the run settles with the file intact — all in-process in this fork's runtime, against a fake OpenAI-compatible endpoint.

**Rejected (b) spawn `little-coder` CLI children bridged via RPC**: (i) the upstream launcher's value is the fixed-extension guarantee, which the inline-factory list already provides structurally (no launcher, no discovery, no user-override paths — DESIGN.md's requirement); (ii) CLI-child bridging would add a second config surface (the child's own settings/models) that PROJECT-RULES §2 structural-enforcement forbids; (iii) probe evidence (a) means there is no "drift too costly" justification.

**Rejected (c) hybrid**: pi 1.0.0's built-in `llama` provider extension overlaps with, but does not replace, the little-coder `llama-cpp-provider` logic (window probe via `/props`, per-model replace-merge of models.json, llamacpp-only re-probe on select). Keeping the one provider registration logic fork-side (WP-002) is both closer to TECHNICAL-SPEC §1's "driver owns it" and avoids double-registration interplay with the _removed_ built-in add-ons (mcp/codemode/tool-search), which are dropped entirely.

## Evidence (executed probe run)

Probe artifacts (throwaway, kept for reference under `work-packages/WP-001-probe/`):

- `staged-probe.mjs` + `probe-v2.mjs` — the harness showing every stage: pi import → TS extension import (`file://` Dynamic import suffices for the probe; the fork's lane will compile it) → fake server spawn → `ModelRuntime.create` + single-`llamacpp`-provider registration → `DefaultResourceLoader({extensionFactories})` → `createAgentSession` → scripted prompt.
- `evidence.log` — the run: session created, prompt settled, **file intact = true, verdict = PASS**.
- `http.log` — the fake server saw `tools=["read","bash","edit","write"]` and auth-bearing completions calls, confirming the fixed tool set surfaced correctly.

One probe-run fix worth recording: this probe needed `ModelRuntime.create()` (not `new ModelRuntime(...)`) — the constructor takes an internal `(credentials, config, modelsPath, modelsStore, providers, networkEnabled)` tuple. WP-002's driver-side construction should call the async factory (which is also what `npm-package-fallback.ts` currently reaches through pi's own plumbing).

Two follow-ups this probe surfaced, both **WP-002/WP-003 scope**, recorded so they aren't re-derived:

1. **Extension UI bindings in SDK mode**: pi 1.0.0's `ExtensionRunner.setUIContext` falls back to a no-op UI (`notify: () => {}`) when `bindExtensions({uiContext})` is never called; the retained guardrails emit their one-voice `harness intervention: …` lines through `ctx.ui.notify`, so the **fork must provide a `uiContext` whose `notify` routes to the driver's `notify` event stream** (TRANSCRIPT intervention cards), not the no-op. (DESIGN.md already names this card type as first-class; this is where it gets wired.)
2. `permission-gate` needs `ctx.ui.confirm` bound the same way, with the GUI's composer-conflict card as the confirmation surface; in SDK mode with no bindings it silently returns `false` (deny) — the safe default, but the GUI must actually present it.

Keep/drop verdicts themselves are already fixed by the scope skill; WP-001 does not re-litigate them.
