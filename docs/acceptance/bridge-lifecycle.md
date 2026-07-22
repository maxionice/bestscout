# Bridge lifecycle acceptance

Date: 2026-07-21

Profile: `fm26-steam-23583635`

Bridge originally tested: `0.3.0`; current candidate: `0.4.0`

## Automated evidence

- A synthetic exact-profile installation covers first install, idempotent
  reinstall, managed update and verified uninstall.
- Running-process input rejects mutation before a plugin directory is created.
- Unmanaged and post-install modified DLLs cannot be replaced or removed.
- Non-PE artifacts are rejected before any destination path is created.
- A manifest symlink is classified as invalid and is never followed.
- A plugin-directory symlink resolving outside the selected game root is
  rejected even by status inspection.
- CLI parsing preserves paths with spaces and rejects invalid option/command
  combinations.
- A source-level synchronization test keeps the manifest bridge version equal to
  the BepInEx plugin version.
- Interrupted-transaction residue is surfaced explicitly and blocks mutation.

## Real Proton negative test

FM26 build `23583635` was running as the real game process with PID `1517254`.
The status command reported `not_installed`. An install request using the locally
compiled bridge returned exit code 1 and named PID `1517254` as the blocker. A
second status check still reported `not_installed`, and
`BepInEx/plugins/BestScout` still did not exist.

No plugin was copied, injected, updated or removed during this acceptance. The
positive in-game domain-root acceptance remains pending until a normal FM restart.

The same negative acceptance was repeated on 2026-07-22 with candidate `0.4.0`
and artifact SHA-256
`6e00672924f73f76c7450764e7eb875c43a3e6ac315710790404503a30cb8c5d`.
The lifecycle command again named PID `1517254`, returned exit code 1, and a
post-check proved that the BestScout plugin directory was still absent.
