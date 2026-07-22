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
- Real Proton game-process selection with a two-byte PE-signature access probe
- Authenticated loopback bridge scaffold for BepInEx/IL2CPP
- Managed bridge install, update, integrity status and uninstall with a hard
  running-game lock and exact-build gate
- Read-only main-thread probe for FM26 initialisation, interop, database-factory
  and typed person/club/competition reference roots
- Authenticated, main-thread reference catalog with exact type-set, size and
  duplicate validation for the FM26 domain adapter
- Authenticated, single-flight FM26 reference sampler with catalog allowlisting,
  Unity-thread execution, five-second cleanup and independently validated output
- Pinned deterministic local net6 bridge build with output allowlisting,
  path-leak checks and two-rebuild hash verification
- Bounded paginated live-snapshot protocol with end-to-end canonical validation
- Schema-versioned player, staff, club and competition models
- Validated club branding, four typed kit slots and referential club relationships
- Validated global search and composable player-query engine
- HeroUI global-search workspace and advanced player filters
- Custom frameless Linux title bar with native window controls
- All 47 player attributes and 86 FM26 in/out-of-possession role profiles
- Searchable two-phase HeroUI role explorer with backend rankings and coverage indicators
- Persistent player views and selectable columns for every core field and all 47 attributes
- Four-player comparison with role-weighted radar, attribute matrix and replacement search
- Squad depth, age, contract, wage and succession-risk analysis
- Persistent shortlists with favourites, tags, notes and JSON/CSV/HTML exchange
- Fully populated HeroUI player table with accessible shortlist actions
- Complete searchable HeroUI tables for every player, staff, club and competition field
- Atomic canonical edit transactions with exact preview conflicts, private backups,
  a hash-chained journal, read-back verification and exact undo
- Full HeroUI v3 editor workspace for player, staff, club and competition fields
  with staged changes, validated preview, history, restore and undo
- Persistent preset manager and filtered mass editor with set, add, scale and
  clamp strategies, bounded server-side preview and atomic commit
- Persistent per-field attribute freezer with exact, allow-increase and
  monitor-only policies, unresolved-rule blocking and journaled correction
- Deterministic local Newgen facepack assignments with full image decoding,
  exact `r-UID` configuration, atomic activation and tamper-safe removal
- Canonical fitness, morale, injury and ban model with deterministic squad
  availability, a full HeroUI medical workspace and journaled correction actions
- Canonical immediate, future, loan and reciprocal swap transfers with validated
  routes, two-sided destination contracts and a journaled HeroUI Transfer Center
- Canonical staff assignments, profile data, languages, qualifications,
  competition registrations and typed relationships with a journaled HeroUI
  People & Registration Center
- Canonical player/staff appearance, secondary nationalities and player
  preferred moves with bounded validation and backward-compatible defaults
- Referentially validated club identity, competition, finance, stadium and
  facilities commands with a journaled HeroUI Club Operations Center
- Referentially validated competition profiles, champions, stages, fixtures
  and standings with a journaled HeroUI Competition Operations Center
- Explainable development probability and projected CA/attribute peaks with
  configurable Wonderkid, bargain, free-agent and expiring-contract smart lists
- Reproducible AppImage, DEB and RPM builds with bundle validation and SHA-256
  manifests
- Sandboxed Flatpak offline edition with explicit runtime capability gating
- Native Steam Deck AppImage edition with a Gaming Mode launcher and bilingual
  setup instructions
- Draft-first release workflow with signed SLSA provenance and pre-publication
  verification for every checksummed artifact

See [the roadmap](docs/roadmap.md) and
[the feature-parity specification](docs/feature-parity.md) for the complete target.
The exact resumable development state is recorded in
[the current handoff](docs/handoff.md).

User documentation: [English](docs/user-guide.en.md) ·
[Deutsch](docs/user-guide.de.md)

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

Inspect the bridge installation without changing the game:

```bash
cargo run -p bestscout-live --bin bestscout-bridge -- status \
  --game-root "/path/to/Football Manager 26"
```

The same command supports `install --artifact /path/to/BestScout.Bridge.dll`
and `uninstall`, but both mutations refuse to run until FM26 has been closed
normally. See [bridge lifecycle](docs/architecture/bridge-lifecycle.md).

Build native Linux packages and their checksum manifest:

```bash
scripts/build-linux-packages.sh
```

See [Linux packaging and releases](docs/release/linux-packaging.md) for package
support, Flatpak limitations and the tag-driven release process.

## Safety

Unknown Football Manager builds will always be read-only. The canonical editor
engine is validated, journaled and reversible, but live writes remain unavailable
until a field-level FM26 adapter passes the same gates. Do not report sensitive
save data in public issues; see [SECURITY.md](SECURITY.md).

## License

GPL-3.0-or-later. No code, assets or proprietary data from commercial third-party
tools may be contributed.
