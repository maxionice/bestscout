using BepInEx.Logging;
using FM.Game;
using FM.UI;
using Il2CppInterop.Runtime.InteropTypes;
using SI.Bindable.Reference.Core;
using UnityEngine;

namespace BestScout.Bridge;

internal sealed class DomainRootProbeStore
{
    private readonly object _gate = new();
    private DomainRootStatus _status = Empty("not_started", null);
    private ReferenceCatalogStatus _referenceCatalog = EmptyCatalog("waiting_for_game", null);

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

    internal ReferenceCatalogStatus GetReferenceCatalog()
    {
        lock (_gate)
        {
            return _referenceCatalog;
        }
    }

    internal bool NeedsReferenceCatalog()
    {
        lock (_gate)
        {
            return string.Equals(_referenceCatalog.State, "waiting_for_game", StringComparison.Ordinal);
        }
    }

    internal void PublishReferenceCatalog(ReferenceCatalogStatus catalog)
    {
        lock (_gate)
        {
            _referenceCatalog = catalog;
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

    internal static ReferenceCatalogStatus EmptyCatalog(string state, string? error) => new(
        1,
        DateTimeOffset.UtcNow,
        state,
        Array.Empty<ReferenceTypeCatalog>(),
        error);
}

internal static class DomainRootProbeRuntime
{
    private static readonly TimeSpan ProbeInterval = TimeSpan.FromSeconds(2);
    private const int MaximumPropertiesPerReference = 10_000;
    private const int MaximumTotalProperties = 20_000;
    private const int MaximumDescriptionCharacters = 256;
    private const int MaximumTypeCharacters = 128;
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

    internal static ReferenceCatalogStatus GetReferenceCatalog() =>
        _store?.GetReferenceCatalog() ?? DomainRootProbeStore.EmptyCatalog("waiting_for_game", null);

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
            if (rootsResolved && _store.NeedsReferenceCatalog())
            {
                try
                {
                    _store.PublishReferenceCatalog(BuildReferenceCatalog(now));
                }
                catch (Exception error)
                {
                    _store.PublishReferenceCatalog(DomainRootProbeStore.EmptyCatalog(
                        "catalog_failed",
                        BoundedError(error)));
                }
            }
            LogStateChange(state);
        }
        catch (Exception error)
        {
            const string state = "probe_failed";
            _store.Publish(DomainRootProbeStore.Empty(state, BoundedError(error)));
            LogStateChange(state);
        }
    }

    private static bool IsAlive(Il2CppObjectBase? value) => value is not null && value.Pointer != IntPtr.Zero;

    private static bool MetadataIsPopulated(DomainReferenceMetadata metadata) =>
        metadata.GameProperties > 0
        && metadata.PersonProperties > 0
        && metadata.ClubProperties > 0
        && metadata.CompetitionProperties > 0
        && metadata.PersonSearchProperties > 0
        && metadata.PersonSummaryProperties > 0
        && metadata.ClubSummaryProperties > 0
        && metadata.CompetitionSummaryProperties > 0;

    private static ReferenceCatalogStatus BuildReferenceCatalog(DateTimeOffset generatedAtUtc)
    {
        var references = new[]
        {
            BuildReferenceType("game", GameReference.GetPropertiesInternal, GameReference.GetPropertyTypeInternal, GameReference.GetPropertyDescriptionInternal),
            BuildReferenceType("person", PersonReference.GetPropertiesInternal, PersonReference.GetPropertyTypeInternal, PersonReference.GetPropertyDescriptionInternal),
            BuildReferenceType("club", ClubReference.GetPropertiesInternal, ClubReference.GetPropertyTypeInternal, ClubReference.GetPropertyDescriptionInternal),
            BuildReferenceType("competition", CompReference.GetPropertiesInternal, CompReference.GetPropertyTypeInternal, CompReference.GetPropertyDescriptionInternal),
            BuildReferenceType("person_search", PersonSearchReference.GetPropertiesInternal, PersonSearchReference.GetPropertyTypeInternal, PersonSearchReference.GetPropertyDescriptionInternal),
            BuildReferenceType("person_summary", DbSummaryPersonReference.GetPropertiesInternal, DbSummaryPersonReference.GetPropertyTypeInternal, DbSummaryPersonReference.GetPropertyDescriptionInternal),
            BuildReferenceType("club_summary", DbSummaryClubReference.GetPropertiesInternal, DbSummaryClubReference.GetPropertyTypeInternal, DbSummaryClubReference.GetPropertyDescriptionInternal),
            BuildReferenceType("competition_summary", DbSummaryCompetitionReference.GetPropertiesInternal, DbSummaryCompetitionReference.GetPropertyTypeInternal, DbSummaryCompetitionReference.GetPropertyDescriptionInternal),
        };
        var total = references.Sum(reference => reference.PropertyCount);
        if (total > MaximumTotalProperties)
        {
            throw new InvalidOperationException($"Reference catalog contains {total} properties; limit is {MaximumTotalProperties}.");
        }
        return new ReferenceCatalogStatus(1, generatedAtUtc, "catalog_ready", references, null);
    }

    private static ReferenceTypeCatalog BuildReferenceType(
        string name,
        Action<Il2CppSystem.Collections.Generic.List<PropertyID>> collect,
        Func<uint, BindingKind> getBindingKind,
        Func<uint, string> getDescription)
    {
        var propertyIds = new Il2CppSystem.Collections.Generic.List<PropertyID>();
        collect(propertyIds);
        if (propertyIds.Count <= 0 || propertyIds.Count > MaximumPropertiesPerReference)
        {
            throw new InvalidOperationException($"Reference {name} exposes an invalid property count {propertyIds.Count}.");
        }

        var properties = new List<ReferencePropertyMetadata>(propertyIds.Count);
        foreach (var property in propertyIds)
        {
            var propertyId = property.ID;
            var binding = getBindingKind(propertyId);
            var description = BoundedText(getDescription(propertyId), MaximumDescriptionCharacters);
            if (string.IsNullOrWhiteSpace(description))
            {
                description = $"property_{propertyId}";
            }
            properties.Add(new ReferencePropertyMetadata(
                propertyId,
                description,
                BoundedText(binding.Kind.ToString(), 64),
                binding.Reference.ID,
                BoundedNullableText(binding.Type?.FullName, MaximumTypeCharacters)));
        }
        properties.Sort((left, right) => left.PropertyId.CompareTo(right.PropertyId));
        if (properties.Select(property => property.PropertyId).Distinct().Count() != properties.Count)
        {
            throw new InvalidOperationException($"Reference {name} exposes duplicate property identifiers.");
        }
        return new ReferenceTypeCatalog(name, properties.Count, properties);
    }

    private static string BoundedText(string? value, int limit)
    {
        var text = value ?? string.Empty;
        return text.Length <= limit ? text : text[..limit];
    }

    private static string? BoundedNullableText(string? value, int limit) =>
        value is null ? null : BoundedText(value, limit);

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

    public void Update()
    {
        DomainRootProbeRuntime.Tick();
        ReferenceSampleRuntime.Tick();
    }
}
