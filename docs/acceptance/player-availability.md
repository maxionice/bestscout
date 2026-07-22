# Player availability acceptance — 2026-07-22

## Implemented scope

- Canonical condition, match fitness, fatigue, jadedness, morale and happiness
- Structured, dated injury and competition-scoped ban records
- Snapshot game date and validation of every new nested field
- Deterministic available, managed, doubtful and unavailable classification
- Evidence list, active injury/ban details and availability score
- Full database columns and direct typed/JSON editor fields
- Fitness restore, injury clearing, ban clearing, morale stabilization and
  complete match-readiness actions
- Explicit multi-player selection and two-stage preview/commit workflow
- Dark HeroUI v3 workspace inside the custom frameless BestScout shell

## Automated acceptance

- Core tests distinguish injury, ban, fitness and morale evidence and keep
  missing measurements unknown.
- Invalid thresholds, dates, ranges, duplicate nested IDs and unknown
  competition references are rejected by canonical validation.
- Action requests reject duplicate or excessive targets and missing players.
- Match-readiness previews contain exact current-value expectations, clear the
  relevant records and pass whole-snapshot validation.
- No-op actions never create empty journal entries.
- UI tests render medical evidence, require explicit player selection and verify
  that preview and commit use the availability journal gateway.
- Existing editor, freezer, scouting and live-reader regression suites remain
  green.

## Remaining acceptance gates

- Repeat the rendered density, keyboard and interaction review in a native Tauri
  window.
- Map the new canonical fields in the exact FM26 domain reader after the bridge
  is installed on a clean game restart.
- Verify each field write, read-back and undo on the supported FM26 build before
  enabling live correction.

The 1.0 parity checkbox remains open until these native-window and live-adapter
gates pass. Canonical behavior and the safe desktop workflow are implemented.
