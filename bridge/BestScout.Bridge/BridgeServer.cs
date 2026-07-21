using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BepInEx.Logging;

namespace BestScout.Bridge;

internal sealed class BridgeServer : IDisposable
{
    internal const int ProtocolVersion = 1;
    internal const int MaximumRequestCharacters = 64 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly string _descriptorPath;
    private readonly ManualLogSource _log;
    private readonly DomainSnapshotStore _snapshots;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly byte[] _tokenBytes = RandomNumberGenerator.GetBytes(32);
    private TcpListener? _listener;
    private Task? _acceptLoop;

    internal BridgeServer(string configDirectory, ManualLogSource log, DomainSnapshotStore snapshots)
    {
        _descriptorPath = Path.Combine(configDirectory, "bestscout-bridge.json");
        _log = log;
        _snapshots = snapshots;
    }

    internal void Start()
    {
        if (_listener is not null)
        {
            throw new InvalidOperationException("Bridge server is already running.");
        }

        _listener = new TcpListener(IPAddress.Loopback, 0);
        _listener.Start();
        var endpoint = (IPEndPoint)_listener.LocalEndpoint;
        WriteDescriptor(endpoint.Port);
        _acceptLoop = AcceptLoopAsync(_shutdown.Token);
    }

    private void WriteDescriptor(int port)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_descriptorPath)!);
        var descriptor = new BridgeDescriptor(
            ProtocolVersion,
            Environment.ProcessId,
            port,
            Convert.ToBase64String(_tokenBytes),
            DateTimeOffset.UtcNow);
        var temporaryPath = _descriptorPath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(descriptor, JsonOptions));
        File.Move(temporaryPath, _descriptorPath, true);
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var client = await _listener!.AcceptTcpClientAsync(cancellationToken).ConfigureAwait(false);
                _ = HandleClientAsync(client, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            _log.LogError($"BestScout Bridge listener stopped: {error}");
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        try
        {
            using (client)
            {
                client.NoDelay = true;
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.UTF8, false, 4096, true);
                await using var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, true)
                {
                    AutoFlush = true,
                };

                BridgeResponse response;
                try
                {
                    var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                    response = Handle(line);
                }
                catch (Exception error) when (error is JsonException or FormatException)
                {
                    response = Error(string.Empty, "invalid_request");
                }

                await writer.WriteLineAsync(JsonSerializer.Serialize(response, JsonOptions)).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            _log.LogWarning($"BestScout Bridge client failed: {error.Message}");
        }
    }

    private BridgeResponse Handle(string? line)
    {
        if (string.IsNullOrEmpty(line) || line.Length > MaximumRequestCharacters)
        {
            return Error(string.Empty, "invalid_request");
        }

        var request = JsonSerializer.Deserialize<BridgeRequest>(line, JsonOptions);
        if (request is null || request.ProtocolVersion != ProtocolVersion || string.IsNullOrWhiteSpace(request.Id))
        {
            return Error(request?.Id ?? string.Empty, "unsupported_protocol");
        }
        if (!Authenticate(request.Token))
        {
            return Error(request.Id, "unauthorized");
        }

        return request.Method switch
        {
            "health" => Success(request.Id, new HealthResult(Plugin.PluginVersion, Environment.ProcessId, true)),
            "capabilities" => Success(request.Id, new CapabilityResult(true, _snapshots.IsAvailable, false)),
            "snapshot_manifest" => SnapshotManifest(request.Id),
            "snapshot_page" => SnapshotPage(request),
            _ => Error(request.Id, "unknown_method"),
        };
    }

    private BridgeResponse SnapshotManifest(string requestId)
    {
        var manifest = _snapshots.GetManifest();
        return manifest is null
            ? Error(requestId, "domain_read_unavailable")
            : Success(requestId, manifest);
    }

    private BridgeResponse SnapshotPage(BridgeRequest request)
    {
        if (!request.Parameters.HasValue || request.Parameters.Value.ValueKind != JsonValueKind.Object)
        {
            return Error(request.Id, "invalid_parameters");
        }
        var parameters = request.Parameters.Value.Deserialize<SnapshotPageRequest>(JsonOptions);
        if (parameters is null
            || string.IsNullOrWhiteSpace(parameters.SnapshotId)
            || string.IsNullOrWhiteSpace(parameters.EntityKind))
        {
            return Error(request.Id, "invalid_parameters");
        }
        return _snapshots.TryGetPage(parameters, out var page, out var error)
            ? Success(request.Id, page!)
            : Error(request.Id, error);
    }

    private bool Authenticate(string suppliedToken)
    {
        try
        {
            var supplied = Convert.FromBase64String(suppliedToken);
            return supplied.Length == _tokenBytes.Length
                && CryptographicOperations.FixedTimeEquals(supplied, _tokenBytes);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static BridgeResponse Success(string id, object result) =>
        new(ProtocolVersion, id, true, result, null);

    private static BridgeResponse Error(string id, string error) =>
        new(ProtocolVersion, id, false, null, error);

    public void Dispose()
    {
        _shutdown.Cancel();
        _listener?.Stop();
        try
        {
            _acceptLoop?.Wait(TimeSpan.FromSeconds(2));
        }
        catch (AggregateException)
        {
        }
        _listener = null;
        _acceptLoop = null;
        DeleteDescriptorIfOwned();
        _shutdown.Dispose();
    }

    private void DeleteDescriptorIfOwned()
    {
        try
        {
            if (!File.Exists(_descriptorPath))
            {
                return;
            }

            var descriptor = JsonSerializer.Deserialize<BridgeDescriptor>(
                File.ReadAllText(_descriptorPath),
                JsonOptions);
            if (descriptor?.Pid == Environment.ProcessId && Authenticate(descriptor.Token))
            {
                File.Delete(_descriptorPath);
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            _log.LogWarning($"BestScout Bridge descriptor cleanup failed: {error.Message}");
        }
    }
}
