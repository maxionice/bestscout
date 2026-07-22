# Linux release acceptance — 2026-07-23

This record covers the package-set, Steam Deck and signed-publication gates. It
does not claim FM26 live-adapter or native Steam Deck hardware acceptance.

## Automated acceptance

- `scripts/prepare-steam-deck.mjs` accepts exactly one bounded, regular ELF
  AppImage and emits a native Deck AppImage, executable launcher and exact German
  and English instructions.
- The launcher resolves paths containing spaces, forwards arguments unchanged
  and enables AppImage extraction only with an explicit environment opt-in.
- `scripts/verify-linux-bundles.mjs --require-release-set` requires one AppImage,
  DEB, RPM and Flatpak plus all four exact Steam Deck files. It rejects missing,
  duplicate, undersized, symbolic-link and wrong-signature inputs, and requires
  the Deck AppImage to match the current native AppImage byte for byte.
- The local native build uses the mutually exclusive `--native-only` mode, so
  pre-existing Flatpak or Steam Deck files cannot enter its report or checksum
  manifest. A regression fixture covers a populated output directory.
- The Linux bundle CI job calls the same local packaging entrypoint rather than
  maintaining a second build recipe; release metadata validation enforces this.
- Native builds pin the timestamp, timezone and locale to the source commit.
  AppImage consumes `SOURCE_DATE_EPOCH`; bounded DEB and RPM normalization removes
  current archive/build timestamps before signature and checksum verification.
- The tag workflow creates a draft before uploads, validates and checksums the
  complete set, generates SLSA provenance with the commit-pinned
  `actions/attest@v4.2.0`, verifies every subject and publishes only at the final
  step.
- The final upload is reconstructed from eight independently rehashed manifest
  subjects plus the manifest and parsed top-level Sigstore bundle. Unrelated
  files in the staging directory are not passed to GitHub CLI.
- Release metadata tests enforce matching versions, pinned toolchain and actions,
  constrained Flatpak permissions, Steam Deck templates, signed-provenance order
  and draft-first publication.

Commands used for this acceptance:

```text
node --test scripts/*.test.mjs
node scripts/verify-release-metadata.mjs
git diff --check
```

The same workspace state also produced and validated the complete local package
set. `sha256sum -c SHA256SUMS` passed for every listed subject:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `BestScout_0.1.0_amd64.AppImage` | 108,104,184 | `897d954bc2819e04c995d1d73e3a8ce16253db0b993c43b7ea1cd859e4564960` |
| `BestScout_0.1.0_amd64.deb` | 5,087,892 | `ef6015672b0a23fe0b40e7f6188a7fe1e07e2f366b5dfbde8b2486622de93cde` |
| `BestScout-0.1.0-1.x86_64.rpm` | 5,111,182 | `50f4e5b7187c6df049f538643a2834696f1ae1fac2c32860840fa6671d68b290` |
| `BestScout_0.1.0_x86_64.flatpak` | 3,546,840 | `4e75449c2d10f7b8f6c5b82f895ff5a6a03a8dc93ffbf7fc48c1deb390d5179a` |
| `BestScout_0.1.0_SteamDeck_x86_64.AppImage` | 108,104,184 | `897d954bc2819e04c995d1d73e3a8ce16253db0b993c43b7ea1cd859e4564960` |
| `BestScout_0.1.0_SteamDeck_x86_64.sh` | 553 | `65fbd6d99e6b069ac0a88678f8aa7301f56ad4416068a6dc5e87ca93cf08de57` |
| `BestScout_0.1.0_SteamDeck_x86_64.en.md` | 1,377 | `2ac3cc04783120412b38fced8bc8576c8be34fadae430e9b2a920d4eeb4d591e` |
| `BestScout_0.1.0_SteamDeck_x86_64.de.md` | 1,470 | `27951245dfc40d491706d8840ce3c37cd617a6b383ee1bb95425000d7641457d` |

The Flatpak build directory additionally passed `appstreamcli validate --no-net`,
`desktop-file-validate` and a read-only sandbox probe. The probe exposed the
expected `FLATPAK_ID=io.github.maxionice.bestscout` and only five processes in
its private `/proc` namespace.

Two complete native-package builds from the same commit were then run with
`SOURCE_DATE_EPOCH=1784757997`, `TZ=UTC` and `LC_ALL=C`. All three independently
copied outputs compared byte for byte with `cmp`:

| Reproducible native artifact | Bytes | SHA-256 in both builds |
| --- | ---: | --- |
| `BestScout_0.1.0_amd64.AppImage` | 108,104,184 | `897d954bc2819e04c995d1d73e3a8ce16253db0b993c43b7ea1cd859e4564960` |
| `BestScout_0.1.0_amd64.deb` | 5,087,892 | `ef6015672b0a23fe0b40e7f6188a7fe1e07e2f366b5dfbde8b2486622de93cde` |
| `BestScout-0.1.0-1.x86_64.rpm` | 5,111,182 | `50f4e5b7187c6df049f538643a2834696f1ae1fac2c32860840fa6671d68b290` |

This closes the native byte-reproducibility check only. The signed tag workflow,
published artifacts and cross-distribution installation remain separate runtime
gates below.

## Remaining acceptance gates

- [x] Build and validate AppImage, DEB, RPM, Flatpak and Steam Deck artifacts from
  the same commit after these release changes.
- [ ] Exercise the Deck launcher and primary interaction path on Steam Deck in
  both Desktop Mode and Gaming Mode.
- [ ] Run the tag workflow and independently verify its published checksum file
  and Sigstore bundle.
- [ ] Confirm the published 1.0 release remains installable on each supported
  package family.

No release-signing or Steam Deck roadmap checkbox is closed until its respective
runtime gate above has concrete evidence.
