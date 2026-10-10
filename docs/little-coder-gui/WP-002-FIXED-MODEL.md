# WP-002 — fixed-model provider plumbing

Status: **implemented 2026-10-10 — driver + contract + IPC cuts landed; probe PASS.**

Scope (ROADMAP): the driver owns a single registered provider+model
(`llamacpp/Qwen3.5-9B`-shaped, OpenAI-compatible endpoint, context window probed live);
the model resolver rejects anything else at session open; no IPC path can express another
choice. Unit tests fail session-open on a mutated model; a log/probe record of a real
session against the served endpoint is the gate.

## What was built

### `packages/pi-sdk-driver/src/fixed-model.ts` (new)

The fixed-model module, single source of truth for the enforcement:

- Constants: `FIXED_PROVIDER_ID` (`llamacpp`), `FIXED_MODEL_ID` (`Qwen3.5-9B`),
  `FIXED_MODEL_API` (`openai-completions`), `FIXED_MAX_TOKENS` (4096),
  `FIXED_TEMPERATURE` (0.3, delivered via the model's `samplingParams` — pi-ai applies
  `model.samplingParams` into every request), `FIXED_THINKING_LEVEL` (`medium`).
- `fixedModelConfig()` builds the `ProviderConfig`: one model entry, text-only input,
  zero cost fields, declared contextWindow 32768 replaced by the probe result before
  registration. `apiKey` is the env-var name `LLAMACPP_API_KEY` — pi 1.0.0 resolves
  `models.json`/`registerProvider` apiKey values through its config-value machinery
  (`process.env[name]` at request time), so no secret is stored fork-side and a
  keyless local llama-server simply has the var unset.
- Endpoint: `LLAMACPP_BASE_URL` env override, else `http://127.0.0.1:8888/v1`
  (TECHNICAL-SPEC §5's canonical `llama-server` port). Ollama as alternative serving
  endpoint (D5) = point `LLAMACPP_BASE_URL` at it; nothing else changes.
- `probeFixedModelContextWindow()`: upstream's ladder (/props → /v1/models). `propsUrlFor`
  strips `/v1` because llama-server serves `/props` at the root;
  `default_generation_settings.n_ctx` is the per-slot window the upstream probe reads.
  Every failure (down, 401, non-JSON, timeout 2 s, implausible value) keeps the declared
  32768 window; probes never throw and never block session open.
- `createFixedModelExtension()`: an inline pi extension (D6's factory mechanism,
  `hidden: true`) that probes once at load and calls `pi.registerProvider()` with the
  fixed pair. Opt-out via `PI_GUI_NO_CTX_PROBE=1` or the driver options.
- `requireFixedSessionModel(runtime, provider, modelId)`: the resolver — the exact
  fixed pair or throw. Message carries the stable suffix
  `this app runs only llamacpp:Qwen3.5-9B` for surfacing.

### Session-open enforcement (`session-supervisor.ts`)

- The fixed-model extension is in `baseCreateOptions().resourceLoaderOptions.extensionFactories`,
  so every runtime built for any session (create, fork, reopen) registers exactly one
  provider. Registration is the enforcement — there is no "list with a default" (D3).
- `createSession`, `forkSession`, and reopen all pass `resolveInitialModel` that funnels
  through `requireFixedSessionModel`; anything else fails session open loudly, never a
  fallback (ROADMAP's "model resolver rejects anything else at session open").
- `thinkingLevel` is hardcoded `FIXED_THINKING_LEVEL` in create and fork; options cannot
  override. `setSessionModel` is deleted; `setSessionThinkingLevel(level)` is a no-op for
  `medium` and throws otherwise ("the fixed model pins thinking at medium").
- `runtime-supervisor.ts` loads the same fixed-model factory in its snapshot inventory,
  so the read-only runtime snapshot reports `llamacpp/Qwen3.5-9B` (this is what keeps the
  composer's selection-gating open and feeds the future read-only model panel; WP-004
  finishes that panel as static).

### Contract cuts (`@pi-gui/session-driver`)

Removed from the shared contract, per TEST-MATRIX's negative row
("model re-selection … endpoints deleted (WP-002)"):

- `SessionModelSelection` type; `setSessionModel` on `SessionDriver`; `initialModel` and
  `initialThinkingLevel` on `CreateSessionOptions`. After these cuts a caller cannot
  _name_ another model to the driver in type space, let alone at runtime.

### IPC cuts (`apps/desktop`)

WP-002's gate "no IPC path can express another choice":

- `contracts/ipc.ts`: channels `pi-gui:set-session-model` and `pi-gui:set-default-model`
  removed with their method types.
- `register-desktop-ipc.ts`: both `ipcMain.handle` registrations removed; `ConversationOwner`
  and `SettingsOwner` picks lose the names.
- `preload.ts`: both bindings removed — the renderer has no exposed bridge method.
- `app-store.ts`: `setSessionModel`/`setDefaultModel` owner methods deleted;
  `buildCreateSessionOptions` (whose only outputs were `initialModel`/`initialThinkingLevel`)
  deleted with its 4 owner wirings; the persisted-defaults restore no longer writes a
  default model back.
- `app-store-composer.ts`: the `/model` composer-command branch (`runComposerCommand`),
  the `setSessionModel` owner helper, and the interface member deleted.
  `/model` also removed from `contracts/composer-commands.ts` (`ParsedComposerCommand`,
  parse branch, incomplete-command message) and from the slash-menu host command list.
- `app-store-worktree.ts` and `contracts/desktop-state.ts`: `provider`/`modelId`/
  `thinkingLevel` removed from `StartThreadInput` + `expectStartThreadInput` validation —
  a start request cannot carry a model.
- Renderer: `handleSetSessionModel` and its feed points removed (`App.tsx` composer +
  command palette, `use-slash-menu` option flow, `use-new-thread-controller` state),
  the command palette's "Switch model…" mode dropped (`palette-actions` `PaletteMode`,
  `canSwitchModel`), and `model-selector.tsx` rewritten as a read-only badge of the fixed
  pair. Kept: `/thinking` menu (driver pins it; the menu's other levels are refused by the
  driver — WP-005 decides the final pin behavior) and model onboarding plumbing (it
  resolves to "no gate" once the fixed pair is registered; WP-005 shrinks it).

## Verification (result at each tier)

- Unit/driver (`packages/pi-sdk-driver`, `pnpm test`): **173/173 pass**, including the new
  `fixed-model.test.mts`: the resolver accepts only the fixed pair, rejects a mutated
  model id and a foreign provider, fails when the pair is not registered; the config
  carries the pinned sampling/limits; `propsUrlFor` strips `/v1`; the probe handler
  accepts both `/props` shapes (`default_generation_settings.n_ctx` and top-level
  `n_ctx`), refuses 401 and implausible values; the extension registers the declared
  window when the probe fails. Updated pre-existing tests to the fixed-model reality:
  turn-capture and bridge/lifecycle fixtures resolve via the driver with
  `probeContextWindow: false` (they assert zero network use); session-usage asserts
  the fixed pair's 32768 window and that the driver surface has no `setSessionModel`;
  provider-scope tests assert per-workspace isolation through the session runtime.
- Renderer contract mirror: `apps/desktop/contracts/fixed-model.ts` holds the display
  pair (the renderer-boundary guard forbids runtime driver imports),
  `tests/unit/fixed-model-contract.spec.ts` asserts it equals the driver's exports.
- Desktop typecheck + full repo `pnpm typecheck`, lint (all touched files
  `--max-warnings 0`), `pnpm test:desktop-unit` (**341 passed**), prettier: green.
- Scripted probe against a live fake endpoint (`work-packages/WP-002-probe/`, `node probe.mjs`
  exit 0), all six checks pass — a real session open + real turn through the driver
  against a served OpenAI-compatible endpoint:

| Check                                                            | Result |
| ---------------------------------------------------------------- | ------ |
| Session opens; config is `llamacpp:Qwen3.5-9B`                   | PASS   |
| Fixed pair resolved (matches constants)                          | PASS   |
| Context window probed from `/props` (131072, not declared 32768) | PASS   |
| `models.json` provider ("openai") is not the session's model     | PASS   |
| Real turn completes against the fake endpoint                    | PASS   |
| Thinking re-selection ("high") refused with the pin message      | PASS   |

Probe artifacts: `probe.mjs` (the harness; imports the driver's built dist directly so it
runs standalone), `fake-server.mjs` (fake llama.cpp: `/props` → `n_ctx` 131072,
chat completions → plain reply; port via `WP002_FAKE_PORT`), `evidence.json` (the run
above, saved). Run it: `node work-packages/WP-002-probe/probe.mjs`.

One bug the probe caught: my first `contextWindowFromProps` read only top-level `n_ctx`
and missed `default_generation_settings.n_ctx` — the exact omission upstream's issue
history warns about. Fixed here and covered by the probe check.

## Not done here (belongs to later WPs, and why)

- Settings provider/MCP/custom-endpoint pages and their supervisor methods
  (`runtime-supervisor` login/logout/custom-provider APIs still exist functionally with
  IPC): those are settings-page surfaces; the UI cut is WP-004. The model-level guarantee
  does not depend on them — with the fixed-model registration, no other provider can be
  the session's model, and the resolver rejects any non-fixed pair.
- Thinking-level cycle UI removal, image-attach cuts, `/login`/`/logout` slash commands:
  WP-004/005.
- Live Qwen3.5-9B run: WP-007's lane (TEST-MATRIX tier 3).

## Notes for downstream WPs

- WP-003: `quality-monitor` needs pi settings `little_coder.model_profiles` budgets; with
  one model the fork can source budgets from constants instead — decide when porting.
- WP-004: `model-selector.tsx` is now a static badge (`data-testid="fixed-model-badge"`);
  the settings "Default model" row is read-only; delete the remaining enabled-models/
  reasoning controls with the pages.
- WP-005: the `/model` references in the incomplete-command table are gone; the composer
  command surface keeps `/clear`, `/thinking` (driver refuses non-medium), `/tree`,
  `/status`, `/session`, `/reload`, `/compact`, `/name` until WP-005's cut.
