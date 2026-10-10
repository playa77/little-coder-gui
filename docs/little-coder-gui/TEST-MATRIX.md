# Test matrix — little-coder-gui

Acceptance is tiered (PROJECT-RULES §6 hierarchy: requirement > measurement on this
model+harness > published benchmark > inference). A tier-3 live run is the acceptance gate
for the product claim; tiers 1–2 de-risk on the way there, they never substitute for it.

| #   | Task type                                                                   | Requirement tier                                                           | Unit/core gate (tier 1–2)                                                                                                                       | Live gate (tier 3, real Qwen3.5-9B)                                                                                                                   |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Write a new small function (fresh file)                                     | demonstrated polyglot strength (pass-type: ~11.6 turns, 82% first-attempt) | fake-endpoint scripted run: tool rows render write/read/edit correctly; refused-rewrite-on-existing-file shows intervention card, not raw error | full run to a correct file + passing harness; count turns, wall time, tool mix; inspect diff                                                          |
| 2   | Fix a bug in an existing function                                           | pass-type                                                                  | scripted edit → guard behavior (edit-before-read enforced; read-guard trim on oversized file)                                                   | full run: bug fixed, no unrelated file touched, diff inspected                                                                                        |
| 3   | Small, specific change to an existing file                                  | pass-type                                                                  | scripted edit on multi-line context; the WP-001 `edits` repair re-homing shows correct application                                              | full run: exactly the asked change, nothing else, diff inspected                                                                                      |
| 4   | Write specific unit tests for given code                                    | pass-type                                                                  | scripted run produces test file, harness runs it, output row renders                                                                            | full run: written tests compile, run, pass against correct impl, fail against a deliberately broken variant (quality of tests judged, not just green) |
| 5   | Deliberately impossible / pathological task (agent loops / exhausts budget) | fail-type (~19 turns, quality-monitor loop detection)                      | scripted loop detection fires; intervention card + honest failure surface, no infinite run                                                      | observed wall-clock convergence; no wedge, no hang                                                                                                    |
| 6   | User initiates cancellation mid-run                                         | requirement                                                                | Stop triggers `session.abort()` path; partial state persists; UI returns to idle cleanly                                                        | observed: cancel mid-tool; app idle; transcript shows what completed                                                                                  |
| 7   | Connectivity / serving failure                                              | requirement                                                                | endpoint unreachable at session open → loud setup-pointer error, no silent fallback                                                             | exercised on WP-007 rig                                                                                                                               |
| 8   | Session persistence & restart                                               | requirement                                                                | core lane (existing pi-gui persistence rules, unchanged)                                                                                        | live run: re-open after restart, transcript and draft intact                                                                                          |

## Negative matrix (must be unreachable, enforced by tests in each relevant WP)

| Removed surface                                   | How tested                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| plan mode / plan-model / action-model / implement | no code path, no IPC, no UI affordance; WP-004 grep fence + core lane    |
| subagent / dispatch / deep-research               | same                                                                     |
| orchestration (child threads) & worktree UI       | same                                                                     |
| scheduled tasks                                   | same                                                                     |
| image attachments                                 | composer has no attach/paste path; property test on composer state shape |
| model re-selection / custom provider add / login  | driver resolver rejects non-fixed selection; endpoints deleted (WP-002)  |
| extension views / desktop extensions / MCP pages  | WP-004                                                                   |

## Live-lane rules (WP-007)

- Explicit opt-in env (`PI_APP_REAL_AUTH=1`, real provider/model env per repo lane rules).
- Model config & versions, endpoint, per-task results, turns, wall time, tool-call mix,
  resource measurements are recorded in the WP-007 doc's Evidence section, not narrated in
  chat.
- A test-writing task only passes if the written tests are meaningful (assert the right
  behavior), not merely green (PROJECT-RULES §7).
- Full diffs of the model's changes are captured per task and reviewed against the
  requirement; android-partial credits are not given for "looks right" diffs.
- A settings/session smoke is never claimed as conversation proof (repo rule, restated).
