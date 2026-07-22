# Linux packaging and releases

BestScout publishes four Linux package formats plus a Steam Deck edition.
AppImage, DEB, RPM and the Steam Deck AppImage are native editions and are the
only editions intended for FM26 process detection, bridge management and guarded
live access. Flatpak is an offline scouting edition: it can import and analyse
local files, but its sandbox deliberately hides host processes.

## Supported packages

| Package | Intended systems | Live FM access |
| --- | --- | --- |
| AppImage | Distribution-independent desktop Linux | Yes |
| DEB | Debian, Ubuntu, Mint and derivatives | Yes |
| RPM | Fedora, openSUSE and derivatives | Yes |
| Flatpak | Sandboxed desktop installation | No; offline scouting only |
| Steam Deck | Native AppImage plus Gaming Mode launcher and DE/EN instructions | Yes |

Flatpak gives applications a private process namespace. Filesystem permissions
do not expose the host's unrestricted `/proc`, so granting more file access
would not make process inspection reliable. BestScout detects Flatpak at runtime,
disables process inspection and all bridge mutations, and explains which native
package to install instead.

## Local native build

Install the Tauri Linux prerequisites plus the host packaging tools, then run:

```bash
scripts/build-linux-packages.sh
```

The script builds AppImage, DEB and RPM, validates their file signatures and
sizes, copies them to `release-artifacts/`, and writes `SHA256SUMS`. The
`NO_STRIP=1` environment setting is intentional: it avoids incompatibility
between linuxdeploy's bundled `strip` and modern ELF RELR sections on rolling
Linux distributions.

To build the offline Flatpak after the native binary exists:

```bash
scripts/build-flatpak.sh
node scripts/verify-linux-bundles.mjs --write-checksums
```

This requires `flatpak` and `flatpak-builder`; the script installs the selected
GNOME runtime only for the current user.

To prepare the Steam Deck edition from the verified native AppImage and validate
the entire local release set:

```bash
node scripts/prepare-steam-deck.mjs
node scripts/verify-linux-bundles.mjs --write-checksums --require-release-set
cd release-artifacts && sha256sum -c SHA256SUMS
```

The Deck AppImage remains an unarchived executable. Its companion launcher
resolves the AppImage relative to itself, preserves command-line arguments and
supports the opt-in `BESTSCOUT_APPIMAGE_EXTRACT_AND_RUN=1` FUSE fallback.

## Release process

1. Update the version in the root and desktop `package.json` files,
   `Cargo.toml`, `tauri.conf.json`, and the Flatpak AppStream metadata.
2. Run `node scripts/verify-release-metadata.mjs` and the complete test suite.
3. Close every documented acceptance gate and run the
   [production-readiness verifier](release-readiness.md).
4. Merge the release commit to `main`.
5. Create and push an annotated tag matching the version, for example `v1.0.0`.
6. The `Release Linux` workflow rebuilds and tests everything on Ubuntu 22.04
   and creates a draft release containing the native, Flatpak and Steam Deck
   artifacts.
7. The workflow validates the complete artifact set, verifies `SHA256SUMS`,
   generates Sigstore-signed SLSA build provenance for every checksummed file,
   and verifies that provenance with GitHub CLI.
8. Only after all gates pass does the workflow upload the checksum manifest and
   portable Sigstore bundle and turn the draft into a published release.

The workflow rejects a tag whose value differs from the application version.
GitHub-hosted Ubuntu 22.04 is the release baseline so the generated binaries use
an older, broadly compatible glibc instead of inheriting a rolling distribution's
newer ABI.

## Verification

After downloading a release, verify it from the directory containing the files:

```bash
sha256sum -c SHA256SUMS
```

Then verify an individual artifact against the signed workflow identity. The
portable bundle works without retrieving the attestation from GitHub:

```bash
gh attestation verify BestScout_1.0.0_amd64.AppImage \
  --repo maxionice/bestscout \
  --bundle BestScout_1.0.0_provenance.sigstore.json \
  --signer-workflow github.com/maxionice/bestscout/.github/workflows/release.yml
```

The SHA-256 manifest detects corruption and enumerates the release subjects. The
Sigstore bundle additionally binds those subjects to the repository's pinned
release workflow through a short-lived GitHub OIDC identity. GitHub documents
the [attestation workflow](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
and [CLI verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-with-the-github-cli).
