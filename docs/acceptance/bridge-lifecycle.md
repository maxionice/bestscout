# Bridge lifecycle acceptance

Date: 2026-07-21

Profile: `fm26-steam-23583635`

Bridge originally tested: `0.3.0`; current candidate: `0.5.0`

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

## Real BepInEx runtime compatibility finding

The user later started FM26 normally with managed bridge `0.4.0` installed.
BepInEx 6 identified the plugin, but its .NET 6.0.7 host rejected the net8.0
artifact before `Load()` with a `NullableContextAttribute` type-load failure. No
bridge descriptor was created, so the Rust client correctly reported no bridge
and kept `domain_read` and `domain_write` false.

Candidate `0.5.0` now targets `net6.0`, replaces the one unavailable cancellation
overload with the .NET 6 `Task.WaitAsync` equivalent, and embeds only the two
compiler-only nullable metadata attributes in the plugin. ILSpy confirms a
`.NETCoreApp,Version=v6.0` target and assembly-local nullable attributes. The exact
Release DLL builds with zero warnings/errors, is 86,528 bytes and has SHA-256
`7957a581325ea63c230d2b5df7fde5cff34247526921256321435ea02609278e`.

FM remained running after this finding, so the installed 0.4.0 bytes and manifest
were deliberately left untouched. Positive load/root/catalog acceptance for 0.5.0
still requires a normal user shutdown, managed update and later user restart.

That hash is retained as historical evidence from the first net6 compatibility
build. The later [reproducibility acceptance](bridge-reproducibility.md) pins the
SDK, C# version and source paths and supersedes the distributable candidate with
an 84,992-byte DLL whose SHA-256 is
`f24ff2949fa8052ca8d29079aabf6a0420b98188b3688756d5eb858771b19cd4`.
Neither candidate was installed while FM was running.
