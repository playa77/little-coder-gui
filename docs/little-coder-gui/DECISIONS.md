# Decisions — little-coder-gui

Append-only. One entry per decision, newest last. Format: date, decision, alternatives
rejected, evidence tier (per PROJECT-RULES §6 hierarchy).

---

## D1 — 2026-10-10 — Does this fork serve _this_ model/harness pair, or a shrunk generic pi-gui?

**Decision:** the fork is the surface. No second app, no re-implementation of pi-gui with
less. All capability comes from porting/re-homing the retained Little Coder extension set
into this fork's embedded runtime.

**Rejected:** "inspired-by" rebuild; keeping the launcher as a subprocess driving the
whole product (WP-001 will still evaluate CLI-child bridging as a _harness delivery_
mechanism if the extension-API drift is too costly, but the decision here — that pi-gui's
product remains this fork's product — is not up for re-litigation in WP-001).

**Evidence tier:** requirement (assignment prompt).

## D2 — 2026-10-10 — Benchmark number we cite and design against

**Decision:** the honest published figure for Qwen3.5-9B on the pi harness is
**9.2% ± 2.4 on Terminal-Bench 2.0 (v0.1.24)** — not the 45.56% Aider Polyglot headline,
which belongs to the pre-pi Python v0.0.2 scaffold and does not transfer.

**Consequence:** UI expectations are set from per-run polyglot behavior (~15–17 turns,
~6 min/task, pass ≈ 11.6 turns vs fail ≈ 19 turns, write-guard fires on ~57% of tasks,
thinking-cap ~0.9×/task, second-attempt rescue ≈ 18% of passes), not from headline %.

**Rejected:** designing around 45.56% by claiming the GUI "exposes" that rate.

**Evidence tier:** published benchmark, ranked per PROJECT-RULES §6.

## D3 — 2026-10-10 — Where Little Coder's capability integration is enforced

**Decision:** structural, not default. Exactly one provider and one model entry
(`llamacpp`, OpenAI-compatible, model id fixed, contextWindow probed live, maxTokens 4096,
temperature 0.3, thinking fixed at `medium` — upstream's interactive-session convention).
Model re-selection, custom-provider add/edit, provider login/skills/MCP IPC all removed at
the contract level.

**Rejected:** shipping the full provider list with one marked default (a default can be
silently changed; that is explicitly forbidden by PROJECT-RULES §2).

**Evidence tier:** requirement.

## D4 — 2026-10-10 — Planning/orchestration stays out even though upstream ships it

**Decision:** plan-mode, subagent, deep-research, phase-model, evidence, browser,
benchmark-profiles, turn-cap/finalize-warn/tool-gating beyond a fixed tool set, bg-shell,
shell-session, branding, prompt-history, update-notice, hello are NOT ported.
`turn-cap` stays (it is mark-of-harness behavior that terminates runaway small-model runs
and produces honest failure UI), with the cap applied by harness code, not env var.

Wait — **correction, 2026-10-10 (D4b):** re-checked against the keep/drop inventory:
`turn-cap`, `tool-gating`, `finalize-warn` are **dropped** (they exist to serve benchmark
harness runs, not the interactive product), and the "termination of runaway runs" behavior
is instead provided by the harness' own `abort` and the quality-monitor's loop detection;
documenting here so the keep-list in TECHNICAL-SPEC §3 stays the single source of truth
(TECHNICAL-SPEC §3 is normative; this entry records the correction).

**Rejected:** porting everything "because upstream has it"; porting nothing "to make
implementation easier" (loss of proven harness behavior is also out of scope: guardrails
STAY).

**Evidence tier:** requirement (assignment prompt exclusions).

## D5 — 2026-10-10 — Which serving backend the defaults target

**Decision:** llama.cpp (`llama-server`, OpenAI-compatible) is the documented, default,
supported serving path, matching little-coder's own canonical local setup and its live
context-window probe (`/props` → `/v1/models`). Ollama is allowed only as an alternative
OpenAI-compatible endpoint a user may point `llamacpp` at — it is not a second registered
provider and not a supported config we test.

**Rejected:** shipping ollama as a first-class provider (it is not upstream's canonical
small-model path in the pi-harness era, and extra providers violate D3).

**Evidence tier:** upstream README/inference, downgrade pending a WP-007 measurement.

## D6 — 2026-10-10 — Harness delivery: port retained extensions as inline factories (WP-001)

**Decision:** the retained Little Coder extension set is delivered as **fork inline
extension factories against embedded pi 1.0.0** — the same mechanism `baseCreateOptions()`
already uses for the fork's own extensions (`extensionFactories` on `resourceLoaderOptions`). The WP-001
audit found the retained set is a strict-subset user of an API that is unchanged (equal or
widened) between pi 0.83.0 and 1.0.0; a strict `tsc` compile of all 16 retained extensions
plus `_shared/` against pi 1.0.0 typings is clean, and the real `write-guard` (+ `_shared`)
loads end-to-end in-process and blocks a scripted whole-file write with the file intact
(probe: `work-packages/WP-001-probe/`, evidence + HTTP logs in the WP doc).

**Rejected:** (b) spawning the `little-coder` CLI in child processes bridged through its
RPC mode — it would reintroduce a launcher and a second config surface that the structural
single-model rule (PROJECT-RULES §2) forbids, and the drift evidence does not justify it;
(c) a hybrid leaning on pi 1.0.0's built-in `llama` provider — the upstream
`llama-cpp-provider` registration logic (live `/props` window probe, per-provider
replace-merge) is what WP-002 re-homes, and pi 1.0.0's built-in does not replicate it.

**Consequences recorded for downstream WPs:**

- WP-002 builds the single `llamacpp` provider registration from the audited
  `ProviderConfig` shape (unchanged 0.83→1.0.0) and must construct the runtime via
  `ModelRuntime.create()` (the raw constructor is internal).
- WP-003 must bind an `ExtensionUIContext` whose `notify` routes to the driver's
  intervention-card stream (pi falls back to a no-op UI in SDK mode otherwise) and whose
  `confirm` serves permission-gate; upstream's two `_shared` guard fences port as fork tests.
- Only packaging-level rewires: `@sinclair/typebox` → `typebox` (pi 1.0.0 ships it
  unscoped), and `extensions-info`'s manifest becomes a fork constant.

**Evidence tier:** measurement on this fork's pinned pi 1.0.0 (audit + probe run).
