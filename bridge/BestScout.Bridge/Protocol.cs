using System.Text.Json;
using System.Text.Json.Serialization;

namespace BestScout.Bridge;

internal sealed record BridgeDescriptor(
    [property: JsonPropertyName("protocol_version")] int ProtocolVersion,
    [property: JsonPropertyName("pid")] int Pid,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("token")] string Token,
    [property: JsonPropertyName("started_at_utc")] DateTimeOffset StartedAtUtc);

internal sealed record BridgeRequest(
    [property: JsonPropertyName("protocol_version")] int ProtocolVersion,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("method")] string Method,
    [property: JsonPropertyName("token")] string Token,
    [property: JsonPropertyName("parameters")] JsonElement? Parameters);

internal sealed record BridgeResponse(
    [property: JsonPropertyName("protocol_version")] int ProtocolVersion,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("result")] object? Result,
    [property: JsonPropertyName("error")] string? Error);

internal sealed record HealthResult(
    [property: JsonPropertyName("bridge_version")] string BridgeVersion,
    [property: JsonPropertyName("pid")] int Pid,
    [property: JsonPropertyName("read_only")] bool ReadOnly);

internal sealed record CapabilityResult(
    [property: JsonPropertyName("health")] bool Health,
    [property: JsonPropertyName("domain_read")] bool DomainRead,
    [property: JsonPropertyName("domain_write")] bool DomainWrite);

internal sealed record SnapshotPageRequest(
    [property: JsonPropertyName("snapshot_id")] string SnapshotId,
    [property: JsonPropertyName("entity_kind")] string EntityKind,
    [property: JsonPropertyName("page_index")] int PageIndex);

internal sealed record DomainEntityCounts(
    [property: JsonPropertyName("players")] int Players,
    [property: JsonPropertyName("staff")] int Staff,
    [property: JsonPropertyName("clubs")] int Clubs,
    [property: JsonPropertyName("competitions")] int Competitions);

internal sealed record DomainPageCounts(
    [property: JsonPropertyName("players")] int Players,
    [property: JsonPropertyName("staff")] int Staff,
    [property: JsonPropertyName("clubs")] int Clubs,
    [property: JsonPropertyName("competitions")] int Competitions);

internal sealed record DomainSnapshotManifest(
    [property: JsonPropertyName("snapshot_id")] string SnapshotId,
    [property: JsonPropertyName("schema_version")] int SchemaVersion,
    [property: JsonPropertyName("generated_at_utc")] DateTimeOffset GeneratedAtUtc,
    [property: JsonPropertyName("page_size")] int PageSize,
    [property: JsonPropertyName("counts")] DomainEntityCounts Counts,
    [property: JsonPropertyName("pages")] DomainPageCounts Pages);

internal sealed record DomainSnapshotPage(
    [property: JsonPropertyName("snapshot_id")] string SnapshotId,
    [property: JsonPropertyName("entity_kind")] string EntityKind,
    [property: JsonPropertyName("page_index")] int PageIndex,
    [property: JsonPropertyName("page_count")] int PageCount,
    [property: JsonPropertyName("items")] IReadOnlyList<JsonElement> Items);
