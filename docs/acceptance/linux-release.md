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
| `BestScout_0.1.0_amd64.AppImage` | 108,104,184 | `b897ab2f64240fd531995923993c5a3cb08d7fbe38c05c49ec8eae8474c36bf6` |
| `BestScout_0.1.0_amd64.deb` | 5,087,896 | `9645442e0d3597f33926a8855bf277467cf47f6361b5a28ff2f887b14d1af4cf` |
| `BestScout-0.1.0-1.x86_64.rpm` | 5,111,246 | `851dfff43669ad7230f7222890370fae12aae01ce88e3b9f1cf019a9350cb036` |
| `BestScout_0.1.0_x86_64.flatpak` | 3,546,840 | `4e75449c2d10f7b8f6c5b82f895ff5a6a03a8dc93ffbf7fc48c1deb390d5179a` |
| `BestScout_0.1.0_SteamDeck_x86_64.AppImage` | 108,104,184 | `b897ab2f64240fd531995923993c5a3cb08d7fbe38c05c49ec8eae8474c36bf6` |
| `BestScout_0.1.0_SteamDeck_x86_64.sh` | 553 | `65fbd6d99e6b069ac0a88678f8aa7301f56ad4416068a6dc5e87ca93cf08de57` |
| `BestScout_0.1.0_SteamDeck_x86_64.en.md` | 1,377 | `2ac3cc04783120412b38fced8bc8576c8be34fadae430e9b2a920d4eeb4d591e` |
| `BestScout_0.1.0_SteamDeck_x86_64.de.md` | 1,470 | `27951245dfc40d491706d8840ce3c37cd617a6b383ee1bb95425000d7641457d` |

The Flatpak build directory additionally passed `appstreamcli validate --no-net`,
`desktop-file-validate` and a read-only sandbox probe. The probe exposed the
expected `FLATPAK_ID=io.github.maxionice.bestscout` and only five processes in
its private `/proc` namespace. The current AppImage was also extracted without
launching it, the DEB and RPM payloads were independently unpacked, and all three
contained an executable x86-64 desktop binary plus the expected desktop entry.
The Flatpak bundle imported successfully into a fresh temporary OSTree repository
as `app/io.github.maxionice.bestscout/x86_64/stable`.

Two complete native-package builds from commit
`c9dc9907324489fe9b48a9698425b843f84809d1` were then run with its derived
`SOURCE_DATE_EPOCH=1784760638`, `TZ=UTC` and `LC_ALL=C`. All three independently
copied outputs compared byte for byte with `cmp`:

| Reproducible native artifact | Bytes | SHA-256 in both builds |
| --- | ---: | --- |
| `BestScout_0.1.0_amd64.AppImage` | 108,104,184 | `b897ab2f64240fd531995923993c5a3cb08d7fbe38c05c49ec8eae8474c36bf6` |
| `BestScout_0.1.0_amd64.deb` | 5,087,896 | `9645442e0d3597f33926a8855bf277467cf47f6361b5a28ff2f887b14d1af4cf` |
| `BestScout-0.1.0-1.x86_64.rpm` | 5,111,246 | `851dfff43669ad7230f7222890370fae12aae01ce88e3b9f1cf019a9350cb036` |

Both RPM copies also retained Tauri's automatically detected
`libwebkit2gtk-4.1.so.0()(64bit)` and `libgtk-3.so.0()(64bit)` runtime
requirements. A regression fixture exercises every RPM dependency class;
normalization compares the complete source and rebuilt dependency metadata before
replacement.

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
