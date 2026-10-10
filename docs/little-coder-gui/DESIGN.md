# Design — little-coder-gui (post-shrink)

## What the product is

A desktop Electron GUI for exactly one workflow: a user opens a project folder, types a
small coding task (function code/fix, small file change, specific unit tests), runs it
through **Little Coder serving Qwen3.5-9B**, watches execution, reviews the diff, runs/reads
test output, and cancels or retries. Nothing else.

## UI architecture (what survives from pi-gui)

Keep single-window structure: activity-conversation pane + workbench (Review tab, file
explorer/editor, integrated terminal). Sidebar collapses to a plain workspace list with a
single active session; one session at a time, one run at a time.

- **Transcript** — unchanged and load-bearing: shows assistant text stream, thinking blocks
  (collapsible), the full tool timeline (read/write/edit/bash/glob/grep/webfetch/websearch)
  with expanded output, and harness-intervention cards. Evidence px: little-coder surfaces
  refusals/interventions as one-voice `harness intervention: …` lines; the GUI must present
  those as first-class cards, not buried text — they are the primary signal that the harness
  redirected a wrong approach (write-guard ~57% of tasks, thinking cap ~0.9×/task).
- **Composer** — keep: text input, draft persistence, queued follow-up (`followUp` mode),
  steer (`steer` mode, ⌘↵), Stop, `@`-file mentions. Cut: image drop/paste, extension cards,
  skills try-it, slash-command composer beyond `/clear`.
- **Review tab** — keep uncommitted/branch comparisons, per-file stage/unstage, and the
  single-turn view via pi-gui's existing `TurnCheckpointStore` (it captures at agent_start /
  message_start / agent_settled). This serves verification of model output directly.
- **Terminal** — keep. Test output is how the user and the second-attempt retry mechanism
  recover; failing exercises burn 19 turns vs 11.6 for passes, so the user needs to see what
  the agent saw, unprompted.
- **Settings** — shrink to: workspace management, appearance/theme, and a static read-only
  "Model" panel that shows the enforced single harness/model and endpoint, with no
  add/remove controls. Providers/MCP/scheduled-tasks/extension pages are removed.

## Runtime architecture

- pi stays embedded in-process via `packages/pi-sdk-driver` (unchanged ownership boundary:
  renderer → preload → main owners → driver → pi 1.0.0).
- **Harness composition is code-level**: the fork builds agent sessions with a fixed
  factory list equal to the retained little-coder extension set (ported inline factories
  against pi 1.0.0, or CLI-child bridging if WP-001 proves the drift is too costly). No
  launcher process, no extension discovery, no user-override paths.
- **Single-model enforcement**: the driver ships a `models.json` containing exactly one
  provider (`llamacpp`) and one model (`Qwen3.5-9B`, context window as served, maxTokens
  4096). `setSessionModel`, custom-provider add/edit, and provider login are deleted from
  the IPC surface, so the renderer cannot express a different choice. A resolver that
  requires this exact model fails the session open instead of falling back.
- Every removed capability loses its contract: orchestration owner, scheduled-task owner,
  checkpoint-orchestration extension, desktop-extension view host, and `extension-ui` package
  are removed, with their IPC routes and persistence formats dropped (not hidden).

## What is deliberately NOT here

Model picker, thinking-level cycle (fixed medium per launcher convention), image
attachments, multi-window/multi-thread, worktrees, scheduled tasks, skills/extensions UI,
MCP/codemode/tool-search add-ons, plan mode/research/orchestration, background-shell tools.
