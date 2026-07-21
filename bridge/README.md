# BestScout in-game bridge

The bridge is a minimal BepInEx IL2CPP plugin that binds to a random loopback TCP
port and writes a per-launch authenticated descriptor to
`BepInEx/config/bestscout-bridge.json`.

Protocol version 1 exposes `health`, `capabilities`, `snapshot_manifest` and
`snapshot_page`. Snapshot pages are immutable for one snapshot ID, bounded to
500 entities and only advertised after a domain adapter has published canonical
schema-v1 JSON. No domain adapter is enabled yet, so a freshly installed bridge
continues to report `domain_read: false`.

The bridge does not redistribute or embed Football Manager assemblies. Its
snapshot cache is read-only, loopback-only and authenticated with a random token
that changes on every game launch.

Build against your local installation:

```bash
dotnet build bridge/BestScout.Bridge/BestScout.Bridge.csproj \
  -p:FM26Root="/path/to/Football Manager 26"
```

Do not install development builds into the game until their exact FM26 profile is
approved. Domain adapters must run game-facing reads on the appropriate game
thread, publish only canonical data into the thread-safe cache and remain gated
by an exact compatibility profile.
