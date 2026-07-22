using BepInEx.Logging;
using FM.Game;
using FM.UI;
using Il2CppInterop.Runtime.InteropTypes;
using UnityEngine;

namespace BestScout.Bridge;

internal sealed class DomainRootProbeStore
{
    private readonly object _gate = new();
    private DomainRootStatus _status = Empty("not_started", null);

    internal DomainRootStatus Get()
    {
        lock (_gate)
        {
            return _status;
        }
    }

    internal void Publish(DomainRootStatus status)
    {
        lock (_gate)
        {
            _status = status;
        }
    }

    internal static DomainRootStatus Empty(string state, string? error) => new(
        1,
        DateTimeOffset.UtcNow,
        state,
        0,
        false,
        0,
        0,
        false,
        new DomainReferenceMetadata(0, 0, 0, 0, 0, 0, 0, 0),
        error);
}

internal static class DomainRootProbeRuntime
{
    private static readonly TimeSpan ProbeInterval = TimeSpan.FromSeconds(2);
    private static DomainRootProbeStore? _store;
    private static ManualLogSource? _log;
    private static DateTimeOffset _nextProbeAt;
    private static string? _lastState;

    internal static void Start(DomainRootProbeStore store, ManualLogSource log)
    {
        _store = store;
        _log = log;
        _nextProbeAt = DateTimeOffset.MinValue;
        _lastState = null;
    }

    internal static void Stop()
    {
        _store = null;
        _log = null;
        _lastState = null;
    }

    internal static void Tick()
    {
        var now = DateTimeOffset.UtcNow;
        if (_store is null || now < _nextProbeAt)
        {
            return;
        }
        _nextProbeAt = now + ProbeInterval;
        try
        {
            var initialisers = Resources.FindObjectsOfTypeAll<FMInitialiser>();
            var contextModules = Resources.FindObjectsOfTypeAll<PluginContextActionsModule>();
            var interopPointers = new HashSet<nint>();
            var subsystem = PluginContextActionsModule.m_interopSubsystem;
            if (IsAlive(subsystem))
            {
                interopPointers.Add(subsystem!.Pointer);
            }

            var metadata = new DomainReferenceMetadata(
                GameReference.GetPropertyCountInternal(),
                PersonReference.GetPropertyCountInternal(),
                ClubReference.GetPropertyCountInternal(),
                CompReference.GetPropertyCountInternal(),
                PersonSearchReference.GetPropertyCountInternal(),
                DbSummaryPersonReference.GetPropertyCountInternal(),
                DbSummaryClubReference.GetPropertyCountInternal(),
                DbSummaryCompetitionReference.GetPropertyCountInternal());
            var initialisationComplete = initialisers.Any(item => IsAlive(item) && item!.m_allInitStepsCompleted);
            var databaseFactoryAvailable = IsAlive(InitSubsystems.s_databaseRecordReferenceFactory);
            var rootsResolved = initialisationComplete
                && interopPointers.Count == 1
                && databaseFactoryAvailable
                && MetadataIsPopulated(metadata);
            var state = rootsResolved ? "roots_resolved" : "waiting_for_game";
            _store.Publish(new DomainRootStatus(
                1,
                now,
                state,
                initialisers.Count(IsAlive),
                initialisationComplete,
                contextModules.Count(IsAlive),
                interopPointers.Count,
                databaseFactoryAvailable,
                metadata,
                null));
            LogStateChange(state);
        }
        catch (Exception error)
        {
            const string state = "probe_failed";
            _store.Publish(DomainRootProbeStore.Empty(state, BoundedError(error)));
            LogStateChange(state);
        }
    }

    private static bool IsAlive(Il2CppObjectBase? value) => value is not null && value.Pointer != nint.Zero;

    private static bool MetadataIsPopulated(DomainReferenceMetadata metadata) =>
        metadata.GameProperties > 0
        && metadata.PersonProperties > 0
        && metadata.ClubProperties > 0
        && metadata.CompetitionProperties > 0
        && metadata.PersonSearchProperties > 0
        && metadata.PersonSummaryProperties > 0
        && metadata.ClubSummaryProperties > 0
        && metadata.CompetitionSummaryProperties > 0;

    private static string BoundedError(Exception error)
    {
        var message = $"{error.GetType().Name}: {error.Message}";
        return message.Length <= 512 ? message : message[..512];
    }

    private static void LogStateChange(string state)
    {
        if (string.Equals(_lastState, state, StringComparison.Ordinal))
        {
            return;
        }
        _lastState = state;
        _log?.LogInfo($"BestScout domain-root probe: {state}.");
    }
}

public sealed class DomainRootProbeBehaviour : MonoBehaviour
{
    public DomainRootProbeBehaviour(nint pointer) : base(pointer)
    {
    }

    public void Update() => DomainRootProbeRuntime.Tick();
}
