using BepInEx.Logging;
using FM.Game;
using FM.GamePlugin;
using FM.UI;
using Il2CppInterop.Runtime.InteropTypes;
using SI.Bindable;
using SI.Bindable.Reference.Core;
using SI.Core;
using SI.Interop;

namespace BestScout.Bridge;

internal sealed record ReferenceSampleWorkItem(
    string RequestId,
    string Family,
    int? EntityIndex,
    IReadOnlyList<uint> PropertyIds);

internal sealed class ReferenceSampleStore
{
    internal const int MaximumProperties = 32;
    internal const int MaximumEntityIndex = 5_000_000;

    private static readonly HashSet<string> IndexedFamilies = new(StringComparer.Ordinal)
    {
        "person",
        "club",
        "competition",
    };

    private readonly object _gate = new();
    private ReferenceSampleWorkItem? _queued;
    private ReferenceSampleStatus? _status;

    internal bool TryEnqueue(
        ReferenceSampleStartRequest request,
        DomainRootStatus roots,
        ReferenceCatalogStatus catalog,
        out ReferenceSampleStatus? status,
        out string error)
    {
        status = null;
        error = string.Empty;
        if (!string.Equals(roots.State, "roots_resolved", StringComparison.Ordinal)
            || !string.Equals(catalog.State, "catalog_ready", StringComparison.Ordinal))
        {
            error = "reference_sample_unavailable";
            return false;
        }
        if (string.IsNullOrWhiteSpace(request.Family)
            || request.PropertyIds is null
            || request.PropertyIds.Count is < 1 or > MaximumProperties
            || request.PropertyIds.Distinct().Count() != request.PropertyIds.Count)
        {
            error = "invalid_parameters";
            return false;
        }

        var reference = catalog.References.SingleOrDefault(candidate =>
            string.Equals(candidate.Name, request.Family, StringComparison.Ordinal));
        if (reference is null)
        {
            error = "invalid_reference_family";
            return false;
        }
        var indexed = IndexedFamilies.Contains(request.Family);
        if ((indexed && request.EntityIndex is null)
            || (!indexed && request.EntityIndex is not null)
            || request.EntityIndex is < 0 or > MaximumEntityIndex)
        {
            error = "invalid_entity_index";
            return false;
        }
        var metadata = request.PropertyIds
            .Select(propertyId => reference.Properties.SingleOrDefault(property => property.PropertyId == propertyId))
            .ToArray();
        if (metadata.Any(property => property is null))
        {
            error = "unknown_property_id";
            return false;
        }

        lock (_gate)
        {
            if (_queued is not null || _status?.State is "queued" or "running")
            {
                error = "reference_sample_busy";
                return false;
            }
            var requestId = Guid.NewGuid().ToString("N");
            var requestedAt = DateTimeOffset.UtcNow;
            _queued = new ReferenceSampleWorkItem(
                requestId,
                request.Family,
                request.EntityIndex,
                request.PropertyIds.ToArray());
            _status = new ReferenceSampleStatus(
                1,
                requestId,
                "queued",
                request.Family,
                request.EntityIndex,
                requestedAt,
                requestedAt,
                null,
                metadata.Select(property => new ReferenceSampleProperty(
                    property!.PropertyId,
                    property.Description,
                    false,
                    null,
                    null,
                    null,
                    null,
                    null)).ToArray(),
                null);
            status = _status;
            return true;
        }
    }

    internal bool TryTakeQueued(out ReferenceSampleWorkItem? workItem)
    {
        lock (_gate)
        {
            workItem = _queued;
            _queued = null;
            return workItem is not null;
        }
    }

    internal void MarkRunning(string requestId)
    {
        lock (_gate)
        {
            if (_status?.RequestId == requestId && _status.State == "queued")
            {
                _status = _status with
                {
                    State = "running",
                    UpdatedAtUtc = DateTimeOffset.UtcNow,
                };
            }
        }
    }

    internal void Record(string requestId, uint propertyId, ReferenceSampleProperty result)
    {
        lock (_gate)
        {
            if (_status?.RequestId != requestId || _status.State != "running")
            {
                return;
            }
            _status = _status with
            {
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                Properties = _status.Properties
                    .Select(property => property.PropertyId == propertyId ? result : property)
                    .ToArray(),
            };
        }
    }

    internal bool HasReceivedEveryProperty(string requestId)
    {
        lock (_gate)
        {
            return _status?.RequestId == requestId
                && _status.Properties.All(property => property.Received);
        }
    }

    internal void Finish(string requestId, string state, string? error)
    {
        lock (_gate)
        {
            if (_status?.RequestId != requestId || _status.State is not ("queued" or "running"))
            {
                return;
            }
            var now = DateTimeOffset.UtcNow;
            _status = _status with
            {
                State = state,
                UpdatedAtUtc = now,
                FinishedAtUtc = now,
                Error = error,
            };
        }
    }

    internal bool TryGet(string requestId, out ReferenceSampleStatus? status)
    {
        lock (_gate)
        {
            status = string.Equals(_status?.RequestId, requestId, StringComparison.Ordinal)
                ? _status
                : null;
            return status is not null;
        }
    }
}

internal static class ReferenceSampleRuntime
{
    private static readonly TimeSpan SampleTimeout = TimeSpan.FromSeconds(5);
    private const int MaximumValueCharacters = 2_048;
    private const int MaximumTypeCharacters = 256;
    private const int MaximumErrorCharacters = 512;
    private static ReferenceSampleStore? _store;
    private static ManualLogSource? _log;
    private static GameInteropSubsystem? _subsystem;
    private static ValueChangedWithSizeCallback? _callback;
    private static ActiveSample? _active;
    private static ulong _nextKey;

    internal static void Start(ReferenceSampleStore store, ManualLogSource log)
    {
        _store = store;
        _log = log;
        _nextKey = BitConverter.ToUInt64(System.Security.Cryptography.RandomNumberGenerator.GetBytes(8)) | (1UL << 63);
    }

    internal static void Stop()
    {
        FinishActive("failed", "bridge_stopped");
        Detach();
        _store = null;
        _log = null;
    }

    internal static void Tick()
    {
        if (_store is null)
        {
            return;
        }
        try
        {
            if (_active is null)
            {
                if (!_store.TryTakeQueued(out var workItem))
                {
                    return;
                }
                EnsureAttached();
                if (_subsystem is null)
                {
                    _store.Finish(workItem!.RequestId, "failed", "interop_subsystem_unavailable");
                    return;
                }
                Begin(workItem!);
            }
            else
            {
                EnsureAttached();
            }
            if (_active is not null && _store.HasReceivedEveryProperty(_active.WorkItem.RequestId))
            {
                FinishActive("completed", null);
            }
            else if (_active is not null && DateTimeOffset.UtcNow - _active.StartedAtUtc >= SampleTimeout)
            {
                FinishActive("timed_out", "one_or_more_channels_did_not_return");
            }
        }
        catch (Exception error)
        {
            var bounded = BoundedError(error);
            _log?.LogWarning($"BestScout reference sample failed: {bounded}");
            FinishActive("failed", bounded);
        }
    }

    private static void EnsureAttached()
    {
        var candidate = PluginContextActionsModule.m_interopSubsystem;
        if (!IsAlive(candidate))
        {
            if (_subsystem is not null)
            {
                FinishActive("failed", "interop_subsystem_unavailable");
                Detach();
            }
            return;
        }
        if (_subsystem is not null && _subsystem.Pointer == candidate!.Pointer)
        {
            return;
        }
        if (_subsystem is not null)
        {
            FinishActive("failed", "interop_subsystem_changed");
            Detach();
            return;
        }
        System.Action<
            Il2CppSystem.ReadOnlySpan<ulong>,
            Il2CppSystem.Collections.Generic.List<TypedValue>,
            Il2CppSystem.ReadOnlySpan<long>> callback = OnChannelDataChange;
        _callback = callback;
        _subsystem = candidate;
        _subsystem!.add_OnChannelDataChange(_callback);
    }

    private static void Detach()
    {
        if (IsAlive(_subsystem) && _callback is not null)
        {
            try
            {
                _subsystem!.remove_OnChannelDataChange(_callback);
            }
            catch (Exception error)
            {
                _log?.LogWarning($"BestScout reference sample callback cleanup failed: {BoundedError(error)}");
            }
        }
        _callback = null;
        _subsystem = null;
    }

    private static void Begin(ReferenceSampleWorkItem workItem)
    {
        try
        {
            var reference = CreateReference(workItem);
            if (!IsAlive(reference))
            {
                _store!.Finish(workItem.RequestId, "failed", "reference_unavailable");
                Detach();
                return;
            }
            var active = new ActiveSample(workItem, reference!, DateTimeOffset.UtcNow);
            _active = active;
            _store!.MarkRunning(workItem.RequestId);
            foreach (var propertyId in workItem.PropertyIds)
            {
                var rawKey = NextKey();
                var key = new Bindings.Key(rawKey);
                active.PropertyByKey.Add(rawKey, propertyId);
                active.OpenKeys.Add(key);
                _subsystem!.OpenChannel(reference!, new PropertyID(propertyId), key);
            }
        }
        catch (Exception error)
        {
            var bounded = BoundedError(error);
            if (_active?.WorkItem.RequestId == workItem.RequestId)
            {
                FinishActive("failed", bounded);
            }
            else
            {
                _store?.Finish(workItem.RequestId, "failed", bounded);
            }
            throw;
        }
    }

    private static InteropReference? CreateReference(ReferenceSampleWorkItem workItem) => workItem.Family switch
    {
        "game" => GameReference.GetInstance(),
        "person" => new PersonReference(workItem.EntityIndex!.Value),
        "club" => new ClubReference(workItem.EntityIndex!.Value),
        "competition" => new CompReference(workItem.EntityIndex!.Value),
        "person_search" => PersonSearchReference.GetInstance(),
        "person_summary" => DbSummaryPersonReference.GetInstance(),
        "club_summary" => DbSummaryClubReference.GetInstance(),
        "competition_summary" => DbSummaryCompetitionReference.GetInstance(),
        _ => null,
    };

    private static void OnChannelDataChange(
        Il2CppSystem.ReadOnlySpan<ulong> keys,
        Il2CppSystem.Collections.Generic.List<TypedValue> values,
        Il2CppSystem.ReadOnlySpan<long> sizes)
    {
        var active = _active;
        if (active is null || values is null)
        {
            return;
        }
        var count = Math.Min(keys.Length, values.Count);
        for (var index = 0; index < count; index++)
        {
            var rawKey = keys[index];
            if (!active.PropertyByKey.TryGetValue(rawKey, out var propertyId))
            {
                continue;
            }
            var value = values[index];
            var original = active.WorkItem.PropertyIds.Contains(propertyId)
                ? propertyId
                : throw new InvalidOperationException("Sample callback returned an unknown property key.");
            var description = GetDescription(active.WorkItem.Family, original);
            try
            {
                var isNull = value is null || value.IsNull;
                _store!.Record(active.WorkItem.RequestId, propertyId, new ReferenceSampleProperty(
                    propertyId,
                    description,
                    true,
                    isNull,
                    isNull ? null : BoundedText(value!.DataType?.FullName, MaximumTypeCharacters),
                    isNull ? null : BoundedText(value!.AsString(), MaximumValueCharacters),
                    index < sizes.Length ? sizes[index] : null,
                    null));
            }
            catch (Exception error)
            {
                _store!.Record(active.WorkItem.RequestId, propertyId, new ReferenceSampleProperty(
                    propertyId,
                    description,
                    true,
                    null,
                    null,
                    null,
                    index < sizes.Length ? sizes[index] : null,
                    BoundedError(error)));
            }
        }
    }

    private static string GetDescription(string family, uint propertyId)
    {
        var catalog = DomainRootProbeRuntime.GetReferenceCatalog();
        return catalog.References
            .Single(reference => string.Equals(reference.Name, family, StringComparison.Ordinal))
            .Properties.Single(property => property.PropertyId == propertyId)
            .Description;
    }

    private static void FinishActive(string state, string? error)
    {
        var active = _active;
        if (active is null)
        {
            return;
        }
        if (IsAlive(_subsystem))
        {
            foreach (var key in active.OpenKeys)
            {
                try
                {
                    _subsystem!.CloseChannel(key);
                }
                catch (Exception closeError)
                {
                    _log?.LogWarning($"BestScout reference channel cleanup failed: {BoundedError(closeError)}");
                }
            }
        }
        _store?.Finish(active.WorkItem.RequestId, state, error);
        _active = null;
        Detach();
    }

    private static ulong NextKey()
    {
        do
        {
            _nextKey++;
        }
        while (_nextKey == 0 || (_active?.PropertyByKey.ContainsKey(_nextKey) ?? false));
        return _nextKey;
    }

    private static bool IsAlive(Il2CppObjectBase? value) => value is not null && value.Pointer != IntPtr.Zero;

    private static string? BoundedText(string? value, int limit) => value switch
    {
        null => null,
        _ when value.Length <= limit => value,
        _ => value[..limit],
    };

    private static string BoundedError(Exception error) =>
        BoundedText($"{error.GetType().Name}: {error.Message}", MaximumErrorCharacters)!;

    private sealed class ActiveSample
    {
        internal ActiveSample(ReferenceSampleWorkItem workItem, InteropReference reference, DateTimeOffset startedAtUtc)
        {
            WorkItem = workItem;
            Reference = reference;
            StartedAtUtc = startedAtUtc;
        }

        internal ReferenceSampleWorkItem WorkItem { get; }
        internal InteropReference Reference { get; }
        internal DateTimeOffset StartedAtUtc { get; }
        internal Dictionary<ulong, uint> PropertyByKey { get; } = new();
        internal List<Bindings.Key> OpenKeys { get; } = new();
    }
}
