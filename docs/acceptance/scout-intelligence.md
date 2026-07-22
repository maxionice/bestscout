# Scout intelligence acceptance — 2026-07-22

## Environment

- Native Tauri development build on Linux/KDE Plasma 6.7.3
- Wayland/OpenGL compositor at 2376 × 1485
- Dark HeroUI v3 interface with the custom BestScout title bar
- FM26 running separately; the accepted screen used synthetic canonical data

## Manual acceptance

- The Talent Radar exposes game-date, minimum PA, maximum bargain value and
  contract-window controls without clipping.
- Wonderkid, bargain, free-agent and expiring-contract lists show independent
  counts and switch without leaving the workspace.
- Selecting a candidate shows CA, PA, projected peak, probability, gain, time to
  peak, data confidence and current market value.
- Factor rows clearly distinguish observed inputs from neutral estimates. Missing
  hidden attributes lower confidence instead of fabricating source values.
- Projected attribute peaks show current and projected values and never exceed 20.

## Automated acceptance

- Core tests cover deterministic classification, free agents, configurable expiry
  windows, leap years, missing-factor confidence and capped attribute peaks.
- UI tests cover smart-list switching, projection details and live recalculation
  after changing a HeroUI number control.

This record accepts the adapter-independent intelligence feature. The unchecked
feature-parity items still require a repeat against canonical data read from a
supported live FM26 build.
