# Linux packaging and releases

BestScout publishes four Linux package formats. AppImage, DEB and RPM are the
native editions and are the only editions intended for FM26 process detection,
bridge management and guarded live access. Flatpak is an offline scouting
edition: it can import and analyse local files, but its sandbox deliberately
hides host processes.

## Supported packages

| Package | Intended systems | Live FM access |
| --- | --- | --- |
| AppImage | Distribution-independent desktop Linux | Yes |
| DEB | Debian, Ubuntu, Mint and derivatives | Yes |
| RPM | Fedora, openSUSE and derivatives | Yes |
| Flatpak | Sandboxed desktop installation | No; offline scouting only |

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

## Release process

1. Update the version in the root and desktop `package.json` files,
   `Cargo.toml`, `tauri.conf.json`, and the Flatpak AppStream metadata.
2. Run `node scripts/verify-release-metadata.mjs` and the complete test suite.
3. Merge the release commit to `main`.
4. Create and push an annotated tag matching the version, for example `v0.1.0`.
5. The `Release Linux` workflow rebuilds and tests everything on Ubuntu 22.04,
   publishes all four packages, and attaches a checksum manifest.

The workflow rejects a tag whose value differs from the application version.
GitHub-hosted Ubuntu 22.04 is the release baseline so the generated binaries use
an older, broadly compatible glibc instead of inheriting a rolling distribution's
newer ABI.

## Verification

After downloading a release, verify it from the directory containing the files:

```bash
sha256sum -c SHA256SUMS
```

Release signing remains a separate 1.0 requirement; a SHA-256 manifest detects
corrupted downloads but is not a cryptographic publisher signature.
