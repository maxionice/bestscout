# Attribute freezer acceptance — 2026-07-22

## Implemented scope

- Versioned plans with up to 5,000 unique canonical field rules
- Exact lock, allow-increase and monitor-only policies selectable per field
- Player, staff, club and competition numeric fields
- Multi-entity and multi-field baseline capture from the visible snapshot
- Private atomic native persistence, update, pause and two-step deletion
- Full change report with current value, baseline, delta and unresolved state
- Bounded correction preview through the canonical transaction engine
- Commit through the existing backup, journal, conflict and undo gateway
- Dark HeroUI v3 workspace inside the frameless BestScout shell

## Automated acceptance

- Core tests distinguish exact violations, accepted increases, monitored changes
  and unchanged fields.
- A decrease under `allow_increase` is a violation; a greater value is not.
- Duplicate targets and non-numeric increase baselines are rejected.
- Missing entities or fields remain in the report and block partial correction.
- Correction operations contain the exact observed current value and restore only
  violations; allowed and monitored changes are excluded.
- Native-store tests cover create, deterministic list order, update, idempotent
  delete, path-traversal rejection and Linux file mode `0600`.
- UI tests build a single plan with different per-field policies, prepare a
  violation and commit it through the journal gateway. A paused plan cannot
  prepare a correction.

## Remaining acceptance gates

- Repeat the rendered interaction and density review in the native Tauri window.
- Capture a stable loaded-save identity in the live adapter.
- Repeat evaluation, correction, read-back verification and undo against the
  supported FM26 build after live domain reading and field writes are enabled.
- Validate the automatic main-thread scheduling policy without writing while FM
  is saving, loading or advancing an unsafe game state.

The 1.0 feature-parity checkbox remains open until these live and native-window
gates pass. Canonical behavior and its persistent desktop workflow are complete.
