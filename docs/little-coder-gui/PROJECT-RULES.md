# Little Coder GUI — project rules

Scope source: the assignment prompt. These rules bind every work package.

1. **The deliverable is a reduction of this fork** (minghinmatthewlam/pi-gui), not a new app and not "a GUI inspired by pi-gui". Work is removal and adaptation of existing code.
2. **One model: Qwen3.5-9B. One harness: Little Coder.** No fallback, no per-phase models, no alternative harness. Enforcement must be structural — a single registered provider/model entry and no runtime re-selection path — because a default setting can be silently changed.
3. **In-product planning is rejected** (order of magnitude out of scope). No plan mode, research agents, orchestration, plan approval, or the interactive RPC that would serve them.
4. **Upstream feature existence is not a requirement.** Every retained component names the demonstrated capability it serves and its verification path with Qwen3.5-9B; every removal states why.
5. **Reduction reaches underlying behavior.** Removing a button is not enough if its command, tool, default, or execution path remains reachable.
6. **Evidence hierarchy:** user boundary > measurement on this exact model+harness version > published benchmark > inference. The 45.56% Aider Polyglot figure belongs to the pre-pi Python v0.0.2 scaffold and does not transfer; the pi-harness number for this model is materially lower (9.2% ± 2.4 on Terminal-Bench 2.0, v0.1.24).
7. **Green tests do not redeem wrong scope.** A representative live sweep with Qwen3.5-9B (function coding, a fix, a small file change, unit-test writing, plus failure and cancellation) is the acceptance gate.
8. **Docs placement:** repo-wide docs in `docs/`; all project-packet and work-package docs under `docs/little-coder-gui/`, hash-pinned in `MANIFEST.json`. Misplaced or misnamed docs are a correctness failure. NOTE: the `little-coder-gui-scope` skill's text still says `little-coder-desktop`; this file overrides it, and the skill should be patched to match.
9. Never delete session history, transcripts, screenshots, or cached artifacts; ask before destructive commands.
