# Preset and mass-edit acceptance — 2026-07-21

## Scope

- Dark HeroUI v3 mass-edit mode inside the transactional editor
- Built-in and locally persistent custom presets
- Player, staff, club and competition targets with text filtering
- Set, add, scale and clamp strategies
- Bounded canonical preview and atomic working-copy commit

## Manual acceptance

- The editor switches between single-edit and mass-edit modes without leaving
  the workspace. The custom BestScout title bar remains the only decoration.
- Preset, target and preview panels form a visible three-step workflow.
- Filters never select hidden rows implicitly: users explicitly select rows or
  choose all currently visible targets, and can clear the selection at any time.
- The preview reports the exact operation count and before/after snapshot hashes
  before the commit action is enabled.
- Custom presets can be created for every canonical entity kind and removed
  independently; numeric-only strategies are disabled for non-numeric fields.
- Live FM writes remain visibly locked. This acceptance covers the validated
  canonical working copy, not a build-specific FM26 write adapter.

## Automated acceptance

- Core tests cover expansion across multiple targets, exact before-value
  expectations, atomic rejection of a non-numeric strategy and unchanged source
  data after rejection.
- UI tests cover explicit multi-target selection, backend preparation, operation
  count and commit through the existing persistent transaction gateway.
- Full project tests, the TypeScript production build, Rust Clippy and the bridge
  build must remain green for merge.

The feature-parity checkbox stays open until this workflow is repeated against a
supported live FM26 build after its field-level write adapter is accepted.
