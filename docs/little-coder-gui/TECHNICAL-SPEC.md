# Technical spec — little-coder-gui (post-shrink)

Normative for implementation. Repo-wide conventions (lint lanes, IPC boundary rules,
persistence format rules) stay in `docs/architecture.md` and nested AGENTS.md files; this
spec adds and amends, it does not replace them.

## 1. Runtime and harness

- Embedded runtime: `@earendil-works/pi-coding-agent` 1.0.0 (current fork dep; revisit only
  if WP-001's drift audit makes 0.83-compatible shelling cheaper than porting).
- Harness capability = the retained-extension set (see §3) + one pi patch reproduced in
  harness code rather than by editing installed pi source: the small-model `edit`
  `oldText/newText` control-character repair (`scripts/patch-pi.mjs`, patch 2). WP-001
  decides where that lands (extension-level normalizer vs fork-local agent-loop seam).
- Fixed model block, single entry, enforced by the driver (`docs`/driver owns it, not UI):
  provider `llamacpp`, api `openai-completions`, model id `Qwen3.5-9B`, contextWindow read
  from the live server (`/props` → `/v1/models` fallback, same ladder as upstream), max
  tokens 4096, temperature 0.3, thinking level fixed `medium` (upstream launcher convention
  for interactive sessions), zero cost fields.
  Endpoint base URL is user-configurable (host the user controls), everything else fixed.
- Agent session construction (`baseCreateOptions`) carries exactly: retained factories +
  transcript-identity + turn-capture (already fork-proven) + the fixed-model resolver.
  pi add-ons `mcp`/`codemode`/`tool-search` are removed.

## 2. IPC surface reductions (renderer cannot reach removed paths)

Removed contracts and their main-process owners/routes, in the shrink WPs:
`constants-scheduled-tasks`, all scheduled-task IPC, orchestration IPC + extension,
worktree create/branch UI, extension-view host/asset protocol + `extension-ui` package,
extension cards/commands, MCP settings page + driver mcp-config, custom-provider
add/edit/login, model picker + thinking cycle, image attachment paths (composer attach,
paste, thumbs, `injectFileAttachmentPreamble` images branch, `SessionImageAttachment`).
Persisted-state migration: consumers of removed formats ignore unknown stale keys on read
(no destructive rewrite of `ui-state`); scheduled-tasks.json and reviewed-files.json are
simply not read.

## 3. Retained harness behavior — keep list (from upstream inventory)

Guardrails: `write-guard`, `read-guard`, `read-guard-edit`, `permission-gate`,
`output-parser`, `quality-monitor`, `thinking-budget`, `turn-cap`, `context-watchdog`.
Injection/context: `extra-tools` (glob/webfetch/websearch), `skill-inject`,
`knowledge-inject`, `project-context`, `checkpoint`, `clear-command`, `extensions-info`
(degenerate: static list, no env manifest), `llama-cpp-provider` (re-homed as the fork's
only provider registration).
Shared helpers under `_shared/` port as-is (`inject`, `intervention`, `safe-ctx`,
`shell-write`, `width`, `allowed-tools`, `skills-root`) plus the skill/knowledge packs
(`skills/tools/*.md`, `skills/knowledge/*.md`; protocols/ is dropped with research
extensions).
Reproduce both upstream guard fences as fork tests: _shared/inject-usage (no per-turn
system-prompt rewrite) and _shared/shell-write (same tool list seen by both guards).
NOT ported: plan-mode, subagent, deep-research, phase-model, evidence*, browser*,
benchmark-profiles, bg-shell, shell-session, branding, prompt-history, update-notice,
finalize-warn, tool-gating (env gate irrelevant when the tool set is fixed), hello.

## 4. Session behavior

- One session per workspace, one run at a time. Composer Stop = `session.abort()`
  (already fork-proven path); queued follow-up and steer stay, both one-at-a-time.
- Thinking blocks, tool rows, and intervention cards come through the existing driver event
  stream; no new event types. Extend the existing `harnessIntervention` notification hook to
  route through the driver's `notify` → fork notice card.
- Task-type reality check baked into acceptance: pass-type tasks converge ~11.6 turns,
  fail-type burn ~19 on a 20-turn cap (upstream behavior); transcript must keep
  full-fidelity rows under both.

## 5. Serving requirement (documented, not code)

Defaults assume a llama.cpp server: `llama-server -m Qwen3.5-9B-*.gguf --port 8888 -c <n>
--jinja`. The GUI probes reachability at session open and fails loudly with a
setup pointer when absent. Ollama is _not_ ported (llamacpp is little-coder's canonical
small-model path; ollama is allowed as an alternative serving endpoint for the same
OpenAI-compatible contract but is not a separate registered provider).

## 6. Verification tiers (repo-native)

Tier names and per-tier gates follow `apps/desktop/tests/AGENTS.md`: unit → core
(fixture-backed Electron) → live (real-model opt-in via PI_APP_REAL_AUTH +
PI_GUI_PROVIDER/PI_GUI_MODEL against the local served model) → production/packaged.
Live lane acceptance requires the representative-task set in TEST-MATRIX.md against
Qwen3.5-9B actually served.
