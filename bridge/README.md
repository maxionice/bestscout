# BestScout in-game bridge

The bridge is a minimal BepInEx IL2CPP plugin that binds to a random loopback TCP
port and writes a per-launch authenticated descriptor to
`BepInEx/config/bestscout-bridge.json`.

It currently exposes only `health` and `capabilities`, both read-only. It does not
redistribute or embed Football Manager assemblies.

Build against your local installation:

```bash
dotnet build bridge/BestScout.Bridge/BestScout.Bridge.csproj \
  -p:FM26Root="/path/to/Football Manager 26"
```

Do not install development builds into the game until their exact FM26 profile is
approved. Future domain methods must be version-gated and covered by protocol and
fixture tests.
