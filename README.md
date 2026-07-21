# BestScout

BestScout is a Linux-first, open-source scouting and real-time editing suite for
Football Manager. The project aims for feature parity with established scouting
and editing tools while remaining local, transparent and safe.

> [!IMPORTANT]
> BestScout is an independent community project. It is not affiliated with or
> endorsed by Sports Interactive or SEGA. The current release is an early
> development build and does not write to a running game yet.

## Current milestone

- Native Linux desktop shell built with Tauri
- FM CSV import with German and English column aliases
- Normalized player model
- Explainable role scoring
- Search, filters and local shortlist UI
- Exact FM26/Proton build fingerprinting and capability profiles
- Bounded read-only Linux process inspection with no write API
- Authenticated loopback bridge scaffold for BepInEx/IL2CPP
- Schema-versioned player, staff, club and competition models
- Validated global search and composable player-query engine
- HeroUI global-search workspace and advanced player filters
- Custom frameless Linux title bar with native window controls

See [the roadmap](docs/roadmap.md) and
[the feature-parity specification](docs/feature-parity.md) for the complete target.

## Development

Requirements: Node.js 22+, Rust 1.85+ and the
[Tauri 2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev
cargo test --workspace
npm run tauri -- dev
```

Diagnose the local FM26/Proton environment without starting the UI:

```bash
cargo run -p bestscout-live --bin bestscout-diagnose
```

## Safety

Unknown Football Manager builds will always be read-only. Future editor writes
must be validated, journaled and reversible. Do not report sensitive save data in
public issues; see [SECURITY.md](SECURITY.md).

## License

GPL-3.0-or-later. No code, assets or proprietary data from commercial third-party
tools may be contributed.
