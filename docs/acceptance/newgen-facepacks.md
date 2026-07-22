# Newgen facepack acceptance — 2026-07-22

## Automated acceptance

- Planning requires explicit newgen confirmation and 1–10,000 unique numeric FM
  UIDs; no age or UID-range heuristic can authorize an assignment.
- Plain and `r-` IDs normalize to exact `r-<UID>` portrait targets. Missing,
  zero, non-numeric and normalization-colliding IDs fail the whole plan.
- The same seed, players and image set produce the same plan and SHA-256 plan
  hash independent of input order.
- Source images are regular non-symlinks, content-unique, bounded by count,
  individual/total bytes, dimensions and pixel count, and fully decoded as PNG
  or JPEG before preview.
- Installation rescans every source, rejects stale plan hashes, writes only into
  a protected staging directory, verifies and syncs content and atomically
  activates a new target with `RENAME_NOREPLACE` without overwriting anything.
- Removal requires a strict manifest, an exact entry set and matching size/hash
  for every managed image and `config.xml`, both before and after the atomic
  deactivation rename. Tamper tests confirm one modified image blocks all removal,
  and the rename test confirms an existing target is never replaced.
- The HeroUI workspace keeps preview disabled until the explicit confirmation,
  passes the exact plan hash into installation, renders at most 200 rows and
  requires a second action before removal.

Commands used during implementation:

```text
cargo test -p bestscout-core facepack
cargo test -p bestscout-desktop facepack
cargo clippy -p bestscout-desktop --all-targets -- -D warnings
npm run test --workspace @bestscout/desktop -- src/FacepackWorkspace.test.tsx
npm run build --workspace @bestscout/desktop
```

## Remaining 1.0 gates

- [ ] Inspect the complete workspace in a native Tauri window at the supported
  viewport and exercise keyboard/focus interaction.
- [ ] Install a test pack for confirmed newgens in a supported FM26 save, perform
  the normal skin/custom-graphics refresh and confirm every visible portrait.
- [ ] Remove that unchanged test pack through BestScout and confirm FM returns to
  its previous graphics after refresh.

The feature-parity checkbox remains open until those native and FM-facing checks
have concrete evidence. No live reader or writer capability is granted by this
tool.
