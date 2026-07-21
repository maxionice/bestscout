# Roadmap

## 0.1 — Foundation

- [x] Rust workspace and Tauri desktop shell
- [x] Canonical player model and explainable scoring engine
- [x] CSV parser with locale-aware aliases
- [x] Compatibility fingerprint command for Proton/FM26
- [x] Versioned capability profiles and read-only process-map inspection
- [x] Synthetic fixture generator

## 0.2 — Scout

- [x] Canonical player, staff, club and competition domain models
- [x] Composable player query protocol and deterministic global search
- [x] HeroUI global-search workspace and advanced player filter surface
- [x] Two-phase HeroUI role explorer and dynamic backend rankings
- [ ] Complete player, staff and club tables
- [x] Saved views and custom columns
- [x] All FM26 in/out-of-possession role attribute profiles
- [x] Multi-player comparison, role-weighted radar charts and similar-player search
- [x] Squad planning, contract, wage and succession analysis
- [ ] Shortlist import/export and notes

## 0.3 — Live reader

- [x] Detect FM26 under Steam/Proton
- [x] Versioned executable, GameAssembly and IL2CPP metadata fingerprints
- [x] Reject unknown or partial fingerprint matches
- [x] Select the real Proton game process and verify minimal read-only access
- [ ] Resolve validated FM26 domain roots
- [ ] Read players, staff, clubs and competitions
- [x] Reject unsupported builds safely

## 0.5 — Core editor

- [ ] Transaction journal, backups and undo
- [ ] Players, contracts, injuries and bans
- [ ] Clubs, finance and facilities
- [ ] Transfers, presets and validated mass edit

## 0.7 — Advanced editor

- [ ] Staff, registrations and relationships
- [ ] Competitions, fixtures and stages
- [ ] Attribute freezer and change monitor
- [ ] Newgen and facepack tooling

## 1.0 — FM26 parity

- [ ] Every supported feature passes the parity acceptance test
- [ ] AppImage, Flatpak, deb, rpm and Steam Deck validation
- [ ] German and English documentation
- [ ] Signed builds and reproducible release process
