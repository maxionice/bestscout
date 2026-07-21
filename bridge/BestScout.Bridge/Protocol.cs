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
    [property: JsonPropertyName("token")] string Token);

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
