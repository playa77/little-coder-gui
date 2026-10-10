# Manifest — docs/little-coder-gui

Packet content inventory. Format: file, purpose, content hash (sha256). Re-pin after every
edit: `sha256sum` each file and sync this table. A hash mismatch means the doc changed
without being re-pinned — that is a review signal, not an error to be silent about.

| File                   | Purpose                                                                                       | sha256                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PROJECT-RULES.md       | binding scope rules / evidence hierarchy / docs placement                                     | `3b7fb2f708dc6b80bbd9a865f448bdce90c032af331a73846c4da1d5bad7d6ec` |
| DESIGN.md              | product + runtime/UI architecture after shrink                                                | `8256eaaba2638e25b1e17e342c4dc2d968b450bff779e554cf9cfec3f4af0f75` |
| TECHNICAL-SPEC.md      | normative implementation spec (runtime, IPC cuts, keep-list, session, serving, tiers)         | `6a26c66493cb3159e47d73e48cbeafc7bb25f4ab02789e4606d08032f9226179` |
| DECISIONS.md           | append-only decision log with rejected alternatives (D1–D6)                                   | `5f079ef22b3b13768aa7b930364e8eec7ff235432ad0d74d7f66055a94dffde7` |
| ROADMAP.md             | WP-001…WP-008 phases A–C, gates, standing constraints, dependency notes (WP-001, WP-002 done) | `975f0d6e056a6cc1468dfff64c3ad955185f437c1cf1b0bb7757dca54ba7a85e` |
| TEST-MATRIX.md         | task-type acceptance matrix + negative matrix + live-lane rules                               | `dd2f48ae9ed3a2e995f61efe8dd56cf7b83bf755466f212b9f56b5e5dbcd205c` |
| WP-001-PI-API-DRIFT.md | work package: pi 0.83→1.0.0 extension-API audit & integration strategy (audit complete, D6)   | `29e31f87438c68d9b2c0aa1e219042e8a40313e05f146c965aaee564dceac41f` |
| WP-002-FIXED-MODEL.md  | work package: fixed-model provider plumbing (implemented, probe PASS)                         | `4093c16b3b68dd1c6aca91ea86b4a2609c94f73201d8037c24a4ac406ebcfdd5` |

Related non-doc artifacts:

| Path                          | Purpose                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work-packages/WP-001-probe/` | WP-001 throwaway probe: staged harness (`staged-probe.mjs`, `probe-v2.mjs`), scripted fake OpenAI-compatible server (`fake-server-log.mjs`), run evidence (`evidence.log`, `stages.log`, `http.log`). Reference only — the fork lanes compile the ports properly in WP-003.                  |
| `work-packages/WP-002-probe/` | WP-002 probe: fixed-model harness (`probe.mjs`) + fake llama.cpp server (`fake-server.mjs`, port via `WP002_FAKE_PORT`) + run evidence (`evidence.json` — six checks, all PASS, including the 131072 `/props` readback). Rerunnable standalone: `node work-packages/WP-002-probe/probe.mjs`. |

Note: hashes above are real sha256 of the current files (first pinned 2026-10-10 by the
WP-001 session); re-run `sha256sum` and re-pin this table after any packet edit. Do not
treat a missing hash as "no hash needed".
