using BepInEx;
using BepInEx.Unity.IL2CPP;

namespace BestScout.Bridge;

[BepInPlugin(PluginId, PluginName, PluginVersion)]
public sealed class Plugin : BasePlugin
{
    public const string PluginId = "io.github.maxionice.bestscout.bridge";
    public const string PluginName = "BestScout Bridge";
    public const string PluginVersion = "0.4.0";

    private BridgeServer? _server;
    private DomainSnapshotStore? _snapshots;
    private DomainRootProbeStore? _domainRoots;
    private DomainRootProbeBehaviour? _domainProbeBehaviour;

    public override void Load()
    {
        try
        {
            _snapshots = new DomainSnapshotStore();
            _domainRoots = new DomainRootProbeStore();
            DomainRootProbeRuntime.Start(_domainRoots, Log);
            _domainProbeBehaviour = AddComponent<DomainRootProbeBehaviour>();
            _server = new BridgeServer(Paths.ConfigPath, Log, _snapshots, _domainRoots);
            _server.Start();
            Log.LogInfo("BestScout Bridge is listening on loopback.");
        }
        catch (Exception error)
        {
            Log.LogError($"BestScout Bridge failed to start: {error}");
            _server?.Dispose();
            _server = null;
            _snapshots = null;
            DomainRootProbeRuntime.Stop();
            if (_domainProbeBehaviour is not null)
            {
                UnityEngine.Object.Destroy(_domainProbeBehaviour);
            }
            _domainRoots = null;
            _domainProbeBehaviour = null;
        }
    }

    public override bool Unload()
    {
        _server?.Dispose();
        _server = null;
        _snapshots?.Clear();
        _snapshots = null;
        DomainRootProbeRuntime.Stop();
        if (_domainProbeBehaviour is not null)
        {
            UnityEngine.Object.Destroy(_domainProbeBehaviour);
            _domainProbeBehaviour = null;
        }
        _domainRoots = null;
        return true;
    }
}
