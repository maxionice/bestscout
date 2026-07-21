using BepInEx;
using BepInEx.Unity.IL2CPP;

namespace BestScout.Bridge;

[BepInPlugin(PluginId, PluginName, PluginVersion)]
public sealed class Plugin : BasePlugin
{
    public const string PluginId = "io.github.maxionice.bestscout.bridge";
    public const string PluginName = "BestScout Bridge";
    public const string PluginVersion = "0.2.0";

    private BridgeServer? _server;
    private DomainSnapshotStore? _snapshots;

    public override void Load()
    {
        try
        {
            _snapshots = new DomainSnapshotStore();
            _server = new BridgeServer(Paths.ConfigPath, Log, _snapshots);
            _server.Start();
            Log.LogInfo("BestScout Bridge is listening on loopback.");
        }
        catch (Exception error)
        {
            Log.LogError($"BestScout Bridge failed to start: {error}");
            _server?.Dispose();
            _server = null;
            _snapshots = null;
        }
    }

    public override bool Unload()
    {
        _server?.Dispose();
        _server = null;
        _snapshots?.Clear();
        _snapshots = null;
        return true;
    }
}
