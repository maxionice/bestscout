using System.Security.Cryptography;
using System.Text.Json;

namespace BestScout.Bridge;

internal sealed class DomainSnapshotStore
{
    private const int SchemaVersion = 1;
    private const int PageSize = 500;
    private const int MaximumJsonCharacters = 256 * 1024 * 1024;
    private const int MaximumPlayers = 500_000;
    private const int MaximumStaff = 250_000;
    private const int MaximumClubs = 50_000;
    private const int MaximumCompetitions = 20_000;

    private readonly object _gate = new();
    private PublishedSnapshot? _current;

    internal bool IsAvailable
    {
        get
        {
            lock (_gate)
            {
                return _current is not null;
            }
        }
    }

    internal void PublishCanonicalJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Length > MaximumJsonCharacters)
        {
            throw new ArgumentException("Canonical snapshot JSON is empty or exceeds the safety limit.", nameof(json));
        }

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("schema_version", out var schema)
            || schema.GetInt32() != SchemaVersion)
        {
            throw new ArgumentException("Canonical snapshot has an unsupported schema version.", nameof(json));
        }

        var entities = new Dictionary<string, JsonElement[]>(StringComparer.Ordinal)
        {
            ["players"] = ReadEntities(root, "players", MaximumPlayers),
            ["staff"] = ReadEntities(root, "staff", MaximumStaff),
            ["clubs"] = ReadEntities(root, "clubs", MaximumClubs),
            ["competitions"] = ReadEntities(root, "competitions", MaximumCompetitions),
        };
        var snapshot = new PublishedSnapshot(
            Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
            DateTimeOffset.UtcNow,
            entities);
        lock (_gate)
        {
            _current = snapshot;
        }
    }

    internal void Clear()
    {
        lock (_gate)
        {
            _current = null;
        }
    }

    internal DomainSnapshotManifest? GetManifest()
    {
        lock (_gate)
        {
            return _current?.Manifest;
        }
    }

    internal bool TryGetPage(SnapshotPageRequest request, out DomainSnapshotPage? page, out string error)
    {
        lock (_gate)
        {
            if (_current is null)
            {
                page = null;
                error = "domain_read_unavailable";
                return false;
            }
            if (!string.Equals(_current.Id, request.SnapshotId, StringComparison.Ordinal))
            {
                page = null;
                error = "snapshot_changed";
                return false;
            }
            if (!_current.Entities.TryGetValue(request.EntityKind, out var entities))
            {
                page = null;
                error = "invalid_entity_kind";
                return false;
            }
            var pageCount = PageCount(entities.Length);
            if (request.PageIndex < 0 || request.PageIndex >= pageCount)
            {
                page = null;
                error = "invalid_page_index";
                return false;
            }
            page = new DomainSnapshotPage(
                _current.Id,
                request.EntityKind,
                request.PageIndex,
                pageCount,
                entities.Skip(request.PageIndex * PageSize).Take(PageSize).ToArray());
            error = string.Empty;
            return true;
        }
    }

    private static JsonElement[] ReadEntities(JsonElement root, string property, int limit)
    {
        if (!root.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            throw new ArgumentException($"Canonical snapshot is missing the {property} array.", nameof(root));
        }
        var items = value.EnumerateArray().Select(item => item.Clone()).ToArray();
        if (items.Length > limit)
        {
            throw new ArgumentException($"Canonical snapshot contains too many {property}.", nameof(root));
        }
        return items;
    }

    private static int PageCount(int count) => count == 0 ? 0 : (count + PageSize - 1) / PageSize;

    private sealed class PublishedSnapshot
    {
        internal PublishedSnapshot(string id, DateTimeOffset generatedAtUtc, Dictionary<string, JsonElement[]> entities)
        {
            Id = id;
            Entities = entities;
            Manifest = new DomainSnapshotManifest(
                id,
                SchemaVersion,
                generatedAtUtc,
                PageSize,
                new DomainEntityCounts(
                    entities["players"].Length,
                    entities["staff"].Length,
                    entities["clubs"].Length,
                    entities["competitions"].Length),
                new DomainPageCounts(
                    PageCount(entities["players"].Length),
                    PageCount(entities["staff"].Length),
                    PageCount(entities["clubs"].Length),
                    PageCount(entities["competitions"].Length)));
        }

        internal string Id { get; }
        internal Dictionary<string, JsonElement[]> Entities { get; }
        internal DomainSnapshotManifest Manifest { get; }
    }
}
