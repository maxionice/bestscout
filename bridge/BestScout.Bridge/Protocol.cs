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

internal sealed record DomainReferenceMetadata(
    [property: JsonPropertyName("game_properties")] int GameProperties,
    [property: JsonPropertyName("person_properties")] int PersonProperties,
    [property: JsonPropertyName("club_properties")] int ClubProperties,
    [property: JsonPropertyName("competition_properties")] int CompetitionProperties,
    [property: JsonPropertyName("person_search_properties")] int PersonSearchProperties,
    [property: JsonPropertyName("person_summary_properties")] int PersonSummaryProperties,
    [property: JsonPropertyName("club_summary_properties")] int ClubSummaryProperties,
    [property: JsonPropertyName("competition_summary_properties")] int CompetitionSummaryProperties);

internal sealed record DomainRootStatus(
    [property: JsonPropertyName("schema_version")] int SchemaVersion,
    [property: JsonPropertyName("checked_at_utc")] DateTimeOffset CheckedAtUtc,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("initialiser_count")] int InitialiserCount,
    [property: JsonPropertyName("initialisation_complete")] bool InitialisationComplete,
    [property: JsonPropertyName("context_module_count")] int ContextModuleCount,
    [property: JsonPropertyName("interop_subsystem_count")] int InteropSubsystemCount,
    [property: JsonPropertyName("database_factory_available")] bool DatabaseFactoryAvailable,
    [property: JsonPropertyName("reference_metadata")] DomainReferenceMetadata ReferenceMetadata,
    [property: JsonPropertyName("error")] string? Error);

internal sealed record ReferencePropertyMetadata(
    [property: JsonPropertyName("property_id")] uint PropertyId,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("binding_kind")] string BindingKind,
    [property: JsonPropertyName("reference_id")] uint ReferenceId,
    [property: JsonPropertyName("value_type")] string? ValueType);

internal sealed record ReferenceTypeCatalog(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("property_count")] int PropertyCount,
    [property: JsonPropertyName("properties")] IReadOnlyList<ReferencePropertyMetadata> Properties);

internal sealed record ReferenceCatalogStatus(
    [property: JsonPropertyName("schema_version")] int SchemaVersion,
    [property: JsonPropertyName("generated_at_utc")] DateTimeOffset GeneratedAtUtc,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("references")] IReadOnlyList<ReferenceTypeCatalog> References,
    [property: JsonPropertyName("error")] string? Error);

internal sealed record ReferenceSampleStartRequest(
    [property: JsonPropertyName("family")] string Family,
    [property: JsonPropertyName("entity_index")] int? EntityIndex,
    [property: JsonPropertyName("property_ids")] IReadOnlyList<uint> PropertyIds);

internal sealed record ReferenceSampleStatusRequest(
    [property: JsonPropertyName("request_id")] string RequestId);

internal sealed record ReferenceSampleProperty(
    [property: JsonPropertyName("property_id")] uint PropertyId,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("received")] bool Received,
    [property: JsonPropertyName("is_null")] bool? IsNull,
    [property: JsonPropertyName("value_type")] string? ValueType,
    [property: JsonPropertyName("value_text")] string? ValueText,
    [property: JsonPropertyName("reported_size")] long? ReportedSize,
    [property: JsonPropertyName("error")] string? Error);

internal sealed record ReferenceSampleStatus(
    [property: JsonPropertyName("schema_version")] int SchemaVersion,
    [property: JsonPropertyName("request_id")] string RequestId,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("family")] string Family,
    [property: JsonPropertyName("entity_index")] int? EntityIndex,
    [property: JsonPropertyName("requested_at_utc")] DateTimeOffset RequestedAtUtc,
    [property: JsonPropertyName("updated_at_utc")] DateTimeOffset UpdatedAtUtc,
    [property: JsonPropertyName("finished_at_utc")] DateTimeOffset? FinishedAtUtc,
    [property: JsonPropertyName("properties")] IReadOnlyList<ReferenceSampleProperty> Properties,
    [property: JsonPropertyName("error")] string? Error);

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
