# BestScout in-game bridge

The bridge is a minimal BepInEx IL2CPP plugin that binds to a random loopback TCP
port and writes a per-launch authenticated descriptor to
`BepInEx/config/bestscout-bridge.json`.

Protocol version 1 exposes `health`, `capabilities`, `domain_roots`,
`reference_catalog`, `reference_sample_start`, `reference_sample_status`,
`snapshot_manifest` and `snapshot_page`. `domain_roots` is a read-only main-thread
probe: it verifies that the FM initialiser, game interop subsystem, database
reference factory and typed reference metadata agree, without opening data
channels or reading save entities. Once those roots agree, `reference_catalog`
captures the property ID, description and binding type of eight allowlisted
reference families on the game thread. It is immutable, bounded to 20,000
properties and contains no player, staff, club or competition records.

Bridge 0.5 adds an explicit compatibility-only reference sampler. An authenticated
caller must name one allowlisted family, an index where that family requires one,
and at most 32 distinct property IDs already present in the validated catalog.
Only one request may run at a time. The Unity-thread runtime uses typed FM26
references and property IDs, bounds returned text and type names, closes every
opened channel after completion/failure or a five-second timeout, and retains only
the latest sample. Sampling never publishes a canonical snapshot and never changes
`domain_read` or `domain_write`.

Snapshot pages are immutable for one snapshot ID, bounded to 500 entities and
only advertised after a domain adapter has published canonical schema-v1 JSON.
No entity adapter is enabled yet, so a freshly installed bridge continues to
report `domain_read: false`.

The bridge does not redistribute or embed Football Manager assemblies. Its
snapshot cache is read-only, loopback-only and authenticated with a random token
that changes on every game launch.

Build against your local installation:

```bash
scripts/build-bridge.sh "/path/to/Football Manager 26"
```

The bridge targets the .NET 6 runtime embedded by the installed BepInEx build and
compiles against the generated local `FMGame`, `FM.UI`, `FM.GamePlugin`, SI and
Unity interop assemblies. Compiler-only nullable attributes are embedded in the
plugin because the generated reference set otherwise resolves them to a newer
`System.Runtime`. Those references remain `Private=false`: no Football Manager
assembly is copied into the build output or distributed by BestScout.

The repository pins .NET SDK 10.0.110 with roll-forward disabled, Bridge version
0.5.0 and C# 10, maps the checkout path out of compiler output, excludes volatile
Git-revision suffixes and enables deterministic CI build settings.
`build-bridge.sh` performs two clean Release rebuilds and requires
identical DLL, PDB and dependency-manifest hashes. It also verifies the bounded PE
artifact, exact net6 target and output allowlist. The build remains local because
the reference assemblies come from the user's own FM26/BepInEx installation.

After a managed install and normal game restart, inspect the independently
validated catalog with:

```bash
cargo run -p bestscout-live --bin bestscout-reference-catalog -- \
  --game-root "/path/to/Football Manager 26"
```

After selecting exact IDs from that catalog, capture a bounded compatibility
sample with:

```bash
cargo run -p bestscout-live --bin bestscout-reference-sample -- \
  --game-root "/path/to/Football Manager 26" \
  --family person --entity-index 42 \
  --property-id 7 --property-id 9
```

Do not install development builds into the game until their exact FM26 profile is
approved. Domain adapters must run game-facing reads on the appropriate game
thread, publish only canonical data into the thread-safe cache and remain gated
by an exact compatibility profile.

Use the Rust `bestscout-bridge` lifecycle command instead of copying files by
hand. It accepts only an exact supported FM26 build, refuses every mutation while
an FM process is running, verifies the DLL as a bounded PE artifact and records
its SHA-256 in `BepInEx/plugins/BestScout/bestscout-install.json`. Updates and
uninstall only touch a bridge whose current bytes still match that manifest.
