use std::{
    fs,
    io::{self, BufRead, BufReader, Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const PROTOCOL_VERSION: u32 = 1;
const MAXIMUM_RESPONSE_BYTES: u64 = 1024 * 1024;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeDescriptor {
    pub protocol_version: u32,
    pub pid: u32,
    pub port: u16,
    pub token: String,
    pub started_at_utc: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeHealth {
    pub bridge_version: String,
    pub pid: u32,
    pub read_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeCapabilities {
    pub health: bool,
    pub domain_read: bool,
    pub domain_write: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeProbe {
    pub health: BridgeHealth,
    pub capabilities: BridgeCapabilities,
}

#[derive(Debug, Serialize)]
struct BridgeRequest<'a> {
    protocol_version: u32,
    id: &'a str,
    method: &'a str,
    token: &'a str,
}

#[derive(Debug, Deserialize)]
struct BridgeResponse {
    protocol_version: u32,
    id: String,
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Error)]
pub enum BridgeError {
    #[error("cannot read bridge descriptor: {0}")]
    ReadDescriptor(#[source] io::Error),
    #[error("bridge descriptor is invalid: {0}")]
    InvalidDescriptor(#[source] serde_json::Error),
    #[error("bridge protocol version {0} is not supported")]
    UnsupportedProtocol(u32),
    #[error("bridge descriptor contains no authentication token")]
    MissingToken,
    #[error("cannot connect to the local bridge: {0}")]
    Connect(#[source] io::Error),
    #[error("bridge transport failed: {0}")]
    Transport(#[source] io::Error),
    #[error("cannot encode bridge request: {0}")]
    EncodeRequest(#[source] serde_json::Error),
    #[error("bridge response is invalid: {0}")]
    InvalidResponse(#[source] serde_json::Error),
    #[error("bridge returned mismatched request metadata")]
    MismatchedResponse,
    #[error("bridge rejected the request: {0}")]
    Rejected(String),
    #[error("bridge response has no result")]
    MissingResult,
    #[error("descriptor PID {descriptor} does not match bridge PID {response}")]
    PidMismatch { descriptor: u32, response: u32 },
}

pub struct BridgeClient {
    descriptor: BridgeDescriptor,
    descriptor_path: PathBuf,
}

impl BridgeClient {
    pub fn from_installation(root: &Path) -> Result<Self, BridgeError> {
        Self::from_descriptor(root.join("BepInEx/config/bestscout-bridge.json"))
    }

    pub fn from_descriptor(path: impl AsRef<Path>) -> Result<Self, BridgeError> {
        let descriptor_path = path.as_ref().to_owned();
        let contents = fs::read_to_string(&descriptor_path).map_err(BridgeError::ReadDescriptor)?;
        let descriptor: BridgeDescriptor =
            serde_json::from_str(&contents).map_err(BridgeError::InvalidDescriptor)?;
        if descriptor.protocol_version != PROTOCOL_VERSION {
            return Err(BridgeError::UnsupportedProtocol(
                descriptor.protocol_version,
            ));
        }
        if descriptor.token.is_empty() {
            return Err(BridgeError::MissingToken);
        }
        Ok(Self {
            descriptor,
            descriptor_path,
        })
    }

    pub fn descriptor(&self) -> &BridgeDescriptor {
        &self.descriptor
    }

    pub fn descriptor_path(&self) -> &Path {
        &self.descriptor_path
    }

    pub fn health(&self) -> Result<BridgeHealth, BridgeError> {
        let health: BridgeHealth = self.request("health")?;
        if health.pid != self.descriptor.pid {
            return Err(BridgeError::PidMismatch {
                descriptor: self.descriptor.pid,
                response: health.pid,
            });
        }
        Ok(health)
    }

    pub fn capabilities(&self) -> Result<BridgeCapabilities, BridgeError> {
        self.request("capabilities")
    }

    fn request<T: for<'de> Deserialize<'de>>(&self, method: &str) -> Result<T, BridgeError> {
        let request_id = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_string();
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), self.descriptor.port);
        let mut stream = TcpStream::connect_timeout(&address, CONNECTION_TIMEOUT)
            .map_err(BridgeError::Connect)?;
        stream
            .set_read_timeout(Some(CONNECTION_TIMEOUT))
            .map_err(BridgeError::Transport)?;
        stream
            .set_write_timeout(Some(CONNECTION_TIMEOUT))
            .map_err(BridgeError::Transport)?;

        let request = BridgeRequest {
            protocol_version: PROTOCOL_VERSION,
            id: &request_id,
            method,
            token: &self.descriptor.token,
        };
        serde_json::to_writer(&mut stream, &request).map_err(BridgeError::EncodeRequest)?;
        stream.write_all(b"\n").map_err(BridgeError::Transport)?;
        stream.flush().map_err(BridgeError::Transport)?;

        let mut response_line = String::new();
        BufReader::new(stream)
            .take(MAXIMUM_RESPONSE_BYTES)
            .read_line(&mut response_line)
            .map_err(BridgeError::Transport)?;
        let response: BridgeResponse =
            serde_json::from_str(&response_line).map_err(BridgeError::InvalidResponse)?;
        if response.protocol_version != PROTOCOL_VERSION || response.id != request_id {
            return Err(BridgeError::MismatchedResponse);
        }
        if !response.ok {
            return Err(BridgeError::Rejected(
                response.error.unwrap_or_else(|| "unknown_error".to_owned()),
            ));
        }
        serde_json::from_value(response.result.ok_or(BridgeError::MissingResult)?)
            .map_err(BridgeError::InvalidResponse)
    }
}

pub fn probe_bridge(root: &Path) -> Result<BridgeProbe, BridgeError> {
    let client = BridgeClient::from_installation(root)?;
    Ok(BridgeProbe {
        health: client.health()?,
        capabilities: client.capabilities()?,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        thread,
        time::SystemTime,
    };

    use super::*;

    fn temporary_descriptor(port: u16, pid: u32) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("bestscout-bridge-{unique}.json"));
        fs::write(
            &path,
            serde_json::json!({
                "protocol_version": 1,
                "pid": pid,
                "port": port,
                "token": "test-token",
                "started_at_utc": "2026-07-21T20:00:00Z"
            })
            .to_string(),
        )
        .unwrap();
        path
    }

    #[test]
    fn performs_authenticated_health_handshake() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let pid = 4242;
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(stream.try_clone().unwrap())
                .read_line(&mut line)
                .unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["method"], "health");
            assert_eq!(request["token"], "test-token");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "protocol_version": 1,
                    "id": request["id"],
                    "ok": true,
                    "result": {"bridge_version": "0.1.0", "pid": pid, "read_only": true},
                    "error": null
                })
            )
            .unwrap();
        });

        let path = temporary_descriptor(port, pid);
        let client = BridgeClient::from_descriptor(&path).unwrap();
        let health = client.health().unwrap();
        fs::remove_file(path).unwrap();
        server.join().unwrap();
        assert!(health.read_only);
        assert_eq!(health.bridge_version, "0.1.0");
    }

    #[test]
    fn rejects_unsupported_descriptor_protocol() {
        let path = temporary_descriptor(1234, 1);
        let mut value: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        value["protocol_version"] = 99.into();
        fs::write(&path, value.to_string()).unwrap();
        let result = BridgeClient::from_descriptor(&path);
        fs::remove_file(path).unwrap();
        assert!(matches!(result, Err(BridgeError::UnsupportedProtocol(99))));
    }
}
