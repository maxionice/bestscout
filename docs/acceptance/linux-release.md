# Linux release acceptance — 2026-07-22

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
  duplicate, undersized, symbolic-link and wrong-signature inputs.
- The local native build uses the mutually exclusive `--native-only` mode, so
  pre-existing Flatpak or Steam Deck files cannot enter its report or checksum
  manifest. A regression fixture covers a populated output directory.
- The tag workflow creates a draft before uploads, validates and checksums the
  complete set, generates SLSA provenance with the commit-pinned
  `actions/attest@v4.2.0`, verifies every subject and publishes only at the final
  step.
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
| `BestScout_0.1.0_amd64.AppImage` | 107,620,856 | `04c13410dd70c5a80b2b2f8860dea4cdfbea76d7d3b7e66012912068a3ed282f` |
| `BestScout_0.1.0_amd64.deb` | 4,667,452 | `c17757153f53f0d9e53cb08c329d3a0d200e2b71fb12ce53e83902a6fb68c49b` |
| `BestScout-0.1.0-1.x86_64.rpm` | 4,667,690 | `7102d04d2c1ec415434ee362eb25b137e05215d060e384ddbebe79a55abdd979` |
| `BestScout_0.1.0_x86_64.flatpak` | 3,167,496 | `b046e347fda1e5a61ba146e6517cdf06763469b91d8f51082dd5c72214e17540` |
| `BestScout_0.1.0_SteamDeck_x86_64.AppImage` | 107,620,856 | `04c13410dd70c5a80b2b2f8860dea4cdfbea76d7d3b7e66012912068a3ed282f` |
| `BestScout_0.1.0_SteamDeck_x86_64.sh` | 553 | `65fbd6d99e6b069ac0a88678f8aa7301f56ad4416068a6dc5e87ca93cf08de57` |
| `BestScout_0.1.0_SteamDeck_x86_64.en.md` | 1,377 | `2ac3cc04783120412b38fced8bc8576c8be34fadae430e9b2a920d4eeb4d591e` |
| `BestScout_0.1.0_SteamDeck_x86_64.de.md` | 1,470 | `27951245dfc40d491706d8840ce3c37cd617a6b383ee1bb95425000d7641457d` |

The Flatpak build directory additionally passed `appstreamcli validate --no-net`,
`desktop-file-validate` and a read-only sandbox probe. The probe exposed the
expected `FLATPAK_ID=io.github.maxionice.bestscout` and only five processes in
its private `/proc` namespace.

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
