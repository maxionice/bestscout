# Editor workspace acceptance — 2026-07-21

## Environment

- Native Tauri development build on Linux/KDE Plasma 6.7.3
- Wayland/OpenGL compositor
- 2376 × 1485 native window capture
- FM26 running separately; no bridge installed and no live write capability

## Manual acceptance

- The custom BestScout title bar is the only window decoration and exposes
  minimize, maximize/restore and close controls.
- The interface remains dark, legible and aligned with the existing HeroUI v3
  design system at the tested viewport.
- The editor presents a clear three-step flow: choose entity, edit a whitelisted
  field, then preview and commit the complete change set.
- Player, staff, club and competition selectors are present. All 47 player and 16
  staff attributes remain selectable even when a partial snapshot omits a value.
- The safety header visibly reports `LIVE-SCHREIBEN GESPERRT` while offline
  snapshot commits remain available.
- History, latest-state restore and exact undo actions are visible and disabled
  correctly for an empty journal.

## Automated acceptance

- UI flow test covers exact before-value staging, preview, commit and journal
  update.
- UI boundary test rejects a PA value above 200 before invoking the backend.
- Tauri persistence test covers private before/after backups, journal append,
  restore, file permissions and exact undo.
- Full verification at acceptance: 23 frontend tests and 44 Rust tests passed;
  TypeScript production build and Clippy completed without errors or warnings.

This acceptance covers the canonical workspace only. A live FM26 commit remains a
separate build-profile acceptance item and is intentionally unavailable.
