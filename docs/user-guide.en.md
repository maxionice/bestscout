# BestScout user guide

This guide covers the Linux desktop application. BestScout is independent from
Sports Interactive and SEGA. It does not include Football Manager code, data or
images.

<!-- bestscout-topic:safety -->
## 1. Safety model

BestScout treats scouting, reading and writing as separate capabilities.
Detecting FM26 or matching an executable fingerprint never enables editing.

- Unknown and partial builds stay read-only.
- The Flatpak edition cannot inspect host processes and is always offline-only.
- BestScout never starts or closes Football Manager.
- Bridge installation, update and removal are refused while an FM process or
  launcher is running.
- Live writes remain disabled until the exact build's field adapter, main-thread
  execution, read-back, rollback and undo have all passed acceptance.

The editor workspaces operate on a canonical local snapshot. A green local
preview does not imply that the corresponding live FM adapter is enabled.

<!-- bestscout-topic:packages -->
## 2. Choose a package

| Package | Use it for | Live FM access |
| --- | --- | --- |
| AppImage | Portable native Linux use | Supported after adapter acceptance |
| DEB | Debian, Ubuntu, Mint and derivatives | Supported after adapter acceptance |
| RPM | Fedora, openSUSE and derivatives | Supported after adapter acceptance |
| Flatpak | Sandboxed offline scouting | Never |
| Steam Deck edition | Native AppImage with Gaming Mode launcher | Supported after adapter acceptance |

The Steam Deck download contains an AppImage, launcher and separate German and
English instructions. Keep the launcher and Deck AppImage in the same directory.
See [Linux packaging and release verification](release/linux-packaging.md) for
build and signature details.

<!-- bestscout-topic:first-start -->
## 3. First start and data import

Launch BestScout without starting FM. The built-in synthetic dataset makes every
offline workspace inspectable without real-world data.

To use an FM export, select **CSV importieren** and choose a CSV or text file.
BestScout accepts comma or semicolon separators and common German and English
column names. A player ID and name are the minimum useful identity fields;
missing optional values remain unknown rather than being invented.

After import, confirm the player count and any warnings in the status area. Keep
the original export as your source of truth.

<!-- bestscout-topic:scouting -->
## 4. Search, scouting and analysis

- **Übersicht** searches players, staff, clubs and competitions globally.
- **Scout-Intel** explains development probability and offers configurable
  Wonderkid, bargain, free-agent and expiring-contract lists.
- **Datenbank** exposes complete canonical entity tables.
- **Spielersuche** combines text, age, contract, value and role filters with
  saved views and selectable columns.
- **Kaderanalyse** reports depth, age, wage, contract and succession risks.
- **Vergleich** compares up to four players with a role-weighted radar and
  similar-player suggestions.
- **Shortlist** stores favourites, tags and notes locally and supports
  JSON/CSV/HTML exchange.

Role scores are explainable and include a coverage value. Treat a low-coverage
score as incomplete evidence, not as a precise rating.

<!-- bestscout-topic:workspaces -->
## 5. Canonical operations workspaces

The availability, transfer, people, club and competition workspaces create typed
commands against one canonical snapshot. Every command validates references and
domain invariants before presenting a preview.

- **Verfügbarkeit** covers fitness, condition, morale, injuries and bans.
- **Transfers** covers immediate, future, loan and reciprocal swap routes.
- **People** covers staff assignments, languages, qualifications, registrations
  and relationships.
- **Club-Zentrale** covers identity, competition links, finance, stadium and
  facilities.
- **Wettbewerbs-Zentrale** covers profiles, champions, stages, fixtures and
  standings.

No operation is applied merely by editing a form. Review the exact preview first.

<!-- bestscout-topic:editing -->
## 6. Local editing, mass edit and freezer

The **Editor** stages field changes with exact expected-before values. Commit
creates a private backup and hash-chained journal entry, validates the complete
result and verifies read-back. Undo requires the exact committed snapshot.

The mass editor applies one bounded preset to a filtered target set. Set, add,
scale and clamp strategies reject type mismatches and no-op transactions as a
whole.

The **Freezer** stores per-field rules:

- exact restores any change;
- allow-increase restores only decreases;
- monitor-only reports without correcting.

An unresolved entity or field blocks the entire correction. Automatic live
scheduling remains unavailable until its live read-back gate passes.

<!-- bestscout-topic:live -->
## 7. FM26 detection and the in-game bridge

Open **Live-Spiel** and select **Spiel erkennen** for a read-only diagnosis. The
screen distinguishes installation discovery, exact fingerprint, process probe,
bridge health, domain roots, domain reader and editor permission.

Bridge status can also be inspected from a terminal:

```bash
cargo run -p bestscout-live --bin bestscout-bridge -- status \
  --game-root "/path/to/Football Manager 26"
```

Install or update only after you have closed FM normally. Use the managed
lifecycle command documented in [Bridge lifecycle](architecture/bridge-lifecycle.md);
do not copy plugin files by hand. After installation, start FM yourself, load the
intended save and diagnose again. Never assume that a visible bridge enables
domain reads or writes—the capability cards are authoritative.

<!-- bestscout-topic:facepacks -->
## 8. Newgen facepacks

The **Newgen-Faces** workspace assigns existing local portraits; it does not
generate or upload images.

1. Choose a directory containing direct PNG/JPG/JPEG files and an existing FM
   custom-graphics destination root.
2. Enter a lowercase package ID and a stable assignment seed.
3. Select players with numeric FM UIDs.
4. Explicitly confirm that every selected player is a newgen. BestScout never
   infers this from age or UID size.
5. Review the exact image-to-`r-UID` mapping and target directory.
6. Install atomically, then perform the normal custom-graphics/skin refresh in FM.

The source directory is unchanged. Existing targets are never overwritten.
Removal requires a second confirmation and succeeds only when the strict
manifest, configuration and every image still match. See the
[facepack architecture](architecture/newgen-facepacks.md) for limits and failure
behaviour.

<!-- bestscout-topic:data -->
## 9. Local data, backups and privacy

Editor backups, journals, freezer plans, saved views and shortlist state remain
local. Facepack manifests contain generated filenames, FM target IDs and hashes,
not source directory paths. The bridge descriptor uses a random per-launch token
and binds only to loopback.

Do not post save data, bridge descriptors, tokens or full diagnostic archives in
public issues. Follow [SECURITY.md](../SECURITY.md) for vulnerability reports.

<!-- bestscout-topic:verification -->
## 10. Verify a release

Download the package, `SHA256SUMS` and the portable Sigstore provenance bundle
from the same GitHub release. In that directory run:

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify BestScout_1.0.0_amd64.AppImage \
  --repo maxionice/bestscout \
  --bundle BestScout_1.0.0_provenance.sigstore.json \
  --signer-workflow github.com/maxionice/bestscout/.github/workflows/release.yml
```

Substitute the artifact you downloaded. The release workflow builds a draft,
validates the complete set, signs and independently verifies every checksummed
artifact, and publishes only as its final step.

<!-- bestscout-topic:troubleshooting -->
## 11. Troubleshooting

**FM is not found:** use a native package, confirm the Steam installation exists
and let FM finish launching. Flatpak cannot see the host process.

**Build is unsupported:** do not bypass the gate. Update BestScout or wait for a
versioned compatibility profile for the exact Steam build.

**Bridge install is refused:** close FM normally and wait until the game and
launcher processes have exited. Modified, unmanaged or partial plugin states
require manual inspection; there is no force flag.

**Facepack preview fails:** use direct regular PNG/JPEG files, remove duplicate
content, ensure source and destination do not overlap, and confirm enough unique
images exist. A target directory with the same package ID must not already exist.

**Facepack removal is refused:** preserve the directory. An unexpected, missing,
symbolic or modified file intentionally blocks deletion.

<!-- bestscout-topic:limitations -->
## 12. Current limitations and support boundary

Consult the [roadmap](roadmap.md), [feature-parity specification](feature-parity.md)
and [current handoff](handoff.md) for exact completion evidence. Live FM26 entity
reads and all live writes stay unavailable until their versioned acceptance
records are complete. Native visual checks and hardware-specific Steam Deck
checks are tracked separately from automated tests.

BestScout supports its own source and generated artifacts. It does not provide
Football Manager files, third-party face images, BepInEx distributions or help
with bypassing platform, licensing or safety controls.
