use std::{
    collections::HashSet,
    fs,
    io::{self, BufRead, BufReader, Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use bestscout_core::{
    CURRENT_SCHEMA_VERSION, Club, Competition, DatabaseSnapshot, Player, SnapshotSource, Staff,
    validate_snapshot,
};

const PROTOCOL_VERSION: u32 = 1;
const MAXIMUM_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(2);
const MAXIMUM_PAGE_SIZE: u32 = 5_000;
const MAXIMUM_TOTAL_PAGES: u32 = 2_000;
const MAXIMUM_PLAYERS: u32 = 500_000;
const MAXIMUM_STAFF: u32 = 250_000;
const MAXIMUM_CLUBS: u32 = 50_000;
const MAXIMUM_COMPETITIONS: u32 = 20_000;
const MAXIMUM_REFERENCE_TYPES: usize = 8;
const MAXIMUM_PROPERTIES_PER_REFERENCE: u32 = 10_000;
const MAXIMUM_TOTAL_REFERENCE_PROPERTIES: u32 = 20_000;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_roots: Option<DomainRootStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DomainRootState {
    NotStarted,
    WaitingForGame,
    RootsResolved,
    ProbeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DomainReferenceMetadata {
    pub game_properties: u32,
    pub person_properties: u32,
    pub club_properties: u32,
    pub competition_properties: u32,
    pub person_search_properties: u32,
    pub person_summary_properties: u32,
    pub club_summary_properties: u32,
    pub competition_summary_properties: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DomainRootStatus {
    pub schema_version: u32,
    pub checked_at_utc: String,
    pub state: DomainRootState,
    pub initialiser_count: u32,
    pub initialisation_complete: bool,
    pub context_module_count: u32,
    pub interop_subsystem_count: u32,
    pub database_factory_available: bool,
    pub reference_metadata: DomainReferenceMetadata,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceCatalogState {
    WaitingForGame,
    CatalogReady,
    CatalogFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReferencePropertyMetadata {
    pub property_id: u32,
    pub description: String,
    pub binding_kind: String,
    pub reference_id: u32,
    pub value_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReferenceTypeCatalog {
    pub name: String,
    pub property_count: u32,
    pub properties: Vec<ReferencePropertyMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReferenceCatalogStatus {
    pub schema_version: u32,
    pub generated_at_utc: String,
    pub state: ReferenceCatalogState,
    pub references: Vec<ReferenceTypeCatalog>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotEntityKind {
    Players,
    Staff,
    Clubs,
    Competitions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotEntityCounts {
    pub players: u32,
    pub staff: u32,
    pub clubs: u32,
    pub competitions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotPageCounts {
    pub players: u32,
    pub staff: u32,
    pub clubs: u32,
    pub competitions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotManifest {
    pub snapshot_id: String,
    pub schema_version: u32,
    pub generated_at_utc: String,
    pub page_size: u32,
    pub counts: SnapshotEntityCounts,
    pub pages: SnapshotPageCounts,
}

#[derive(Debug, Serialize)]
struct SnapshotPageRequest<'a> {
    snapshot_id: &'a str,
    entity_kind: SnapshotEntityKind,
    page_index: u32,
}

#[derive(Debug, Deserialize)]
struct SnapshotPage {
    snapshot_id: String,
    entity_kind: SnapshotEntityKind,
    page_index: u32,
    page_count: u32,
    items: Vec<Value>,
}

#[derive(Debug, Serialize)]
struct BridgeRequest<'a> {
    protocol_version: u32,
    id: &'a str,
    method: &'a str,
    token: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    parameters: Option<&'a Value>,
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
    #[error("bridge response exceeded the 16 MiB safety limit")]
    ResponseTooLarge,
    #[error("descriptor PID {descriptor} does not match bridge PID {response}")]
    PidMismatch { descriptor: u32, response: u32 },
    #[error("bridge domain reading is not available")]
    DomainReadUnavailable,
    #[error("bridge snapshot manifest is invalid: {0}")]
    InvalidManifest(String),
    #[error("bridge domain-root status is invalid: {0}")]
    InvalidDomainRoots(String),
    #[error("bridge reference catalog is invalid: {0}")]
    InvalidReferenceCatalog(String),
    #[error("bridge snapshot page is invalid: {0}")]
    InvalidPage(String),
    #[error("live snapshot failed canonical validation with {0} issue(s)")]
    InvalidSnapshot(usize),
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
        let health: BridgeHealth = self.request("health", None)?;
        if health.pid != self.descriptor.pid {
            return Err(BridgeError::PidMismatch {
                descriptor: self.descriptor.pid,
                response: health.pid,
            });
        }
        Ok(health)
    }

    pub fn capabilities(&self) -> Result<BridgeCapabilities, BridgeError> {
        self.request("capabilities", None)
    }

    pub fn domain_roots(&self) -> Result<DomainRootStatus, BridgeError> {
        let status = self.request("domain_roots", None)?;
        validate_domain_roots(&status)?;
        Ok(status)
    }

    pub fn reference_catalog(&self) -> Result<ReferenceCatalogStatus, BridgeError> {
        let catalog = self.request("reference_catalog", None)?;
        validate_reference_catalog(&catalog)?;
        Ok(catalog)
    }

    pub fn snapshot_manifest(&self) -> Result<SnapshotManifest, BridgeError> {
        let manifest = self.request("snapshot_manifest", None)?;
        validate_manifest(&manifest)?;
        Ok(manifest)
    }

    pub fn read_snapshot(&self) -> Result<DatabaseSnapshot, BridgeError> {
        self.health()?;
        if !self.capabilities()?.domain_read {
            return Err(BridgeError::DomainReadUnavailable);
        }
        let manifest = self.snapshot_manifest()?;
        let players = self.collect_pages::<Player>(
            &manifest,
            SnapshotEntityKind::Players,
            manifest.counts.players,
            manifest.pages.players,
        )?;
        let staff = self.collect_pages::<Staff>(
            &manifest,
            SnapshotEntityKind::Staff,
            manifest.counts.staff,
            manifest.pages.staff,
        )?;
        let clubs = self.collect_pages::<Club>(
            &manifest,
            SnapshotEntityKind::Clubs,
            manifest.counts.clubs,
            manifest.pages.clubs,
        )?;
        let competitions = self.collect_pages::<Competition>(
            &manifest,
            SnapshotEntityKind::Competitions,
            manifest.counts.competitions,
            manifest.pages.competitions,
        )?;
        let snapshot = DatabaseSnapshot {
            schema_version: manifest.schema_version,
            source: SnapshotSource::Live,
            players,
            staff,
            clubs,
            competitions,
        };
        let report = validate_snapshot(&snapshot);
        if !report.valid {
            return Err(BridgeError::InvalidSnapshot(report.issues.len()));
        }
        Ok(snapshot)
    }

    fn collect_pages<T: for<'de> Deserialize<'de>>(
        &self,
        manifest: &SnapshotManifest,
        entity_kind: SnapshotEntityKind,
        entity_count: u32,
        page_count: u32,
    ) -> Result<Vec<T>, BridgeError> {
        let mut items = Vec::with_capacity(entity_count as usize);
        for page_index in 0..page_count {
            let parameters = serde_json::to_value(SnapshotPageRequest {
                snapshot_id: &manifest.snapshot_id,
                entity_kind,
                page_index,
            })
            .map_err(BridgeError::EncodeRequest)?;
            let page: SnapshotPage = self.request("snapshot_page", Some(&parameters))?;
            if page.snapshot_id != manifest.snapshot_id
                || page.entity_kind != entity_kind
                || page.page_index != page_index
                || page.page_count != page_count
            {
                return Err(BridgeError::InvalidPage(
                    "snapshot identity or page metadata changed during transfer".to_owned(),
                ));
            }
            if page.items.len() > manifest.page_size as usize {
                return Err(BridgeError::InvalidPage(format!(
                    "page {page_index} contains more than {} items",
                    manifest.page_size
                )));
            }
            let remaining = entity_count as usize - items.len();
            let expected = remaining.min(manifest.page_size as usize);
            if page.items.len() != expected {
                return Err(BridgeError::InvalidPage(format!(
                    "page {page_index} contains {} items, expected {expected}",
                    page.items.len()
                )));
            }
            items.extend(page.items);
        }
        if items.len() != entity_count as usize {
            return Err(BridgeError::InvalidPage(format!(
                "received {} items, expected {entity_count}",
                items.len()
            )));
        }
        serde_json::from_value(Value::Array(items)).map_err(BridgeError::InvalidResponse)
    }

    fn request<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        parameters: Option<&Value>,
    ) -> Result<T, BridgeError> {
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
            parameters,
        };
        serde_json::to_writer(&mut stream, &request).map_err(BridgeError::EncodeRequest)?;
        stream.write_all(b"\n").map_err(BridgeError::Transport)?;
        stream.flush().map_err(BridgeError::Transport)?;

        let mut response_line = String::new();
        BufReader::new(stream)
            .take(MAXIMUM_RESPONSE_BYTES)
            .read_line(&mut response_line)
            .map_err(BridgeError::Transport)?;
        if !response_line.ends_with('\n') {
            return Err(BridgeError::ResponseTooLarge);
        }
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

fn validate_manifest(manifest: &SnapshotManifest) -> Result<(), BridgeError> {
    if manifest.snapshot_id.is_empty() || manifest.snapshot_id.len() > 128 {
        return Err(BridgeError::InvalidManifest(
            "snapshot_id must contain between 1 and 128 bytes".to_owned(),
        ));
    }
    if manifest.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(BridgeError::InvalidManifest(format!(
            "unsupported schema version {}",
            manifest.schema_version
        )));
    }
    if !(1..=MAXIMUM_PAGE_SIZE).contains(&manifest.page_size) {
        return Err(BridgeError::InvalidManifest(format!(
            "page_size must be between 1 and {MAXIMUM_PAGE_SIZE}"
        )));
    }
    let mut total_pages = 0_u32;
    for (kind, count, pages, limit) in [
        (
            "players",
            manifest.counts.players,
            manifest.pages.players,
            MAXIMUM_PLAYERS,
        ),
        (
            "staff",
            manifest.counts.staff,
            manifest.pages.staff,
            MAXIMUM_STAFF,
        ),
        (
            "clubs",
            manifest.counts.clubs,
            manifest.pages.clubs,
            MAXIMUM_CLUBS,
        ),
        (
            "competitions",
            manifest.counts.competitions,
            manifest.pages.competitions,
            MAXIMUM_COMPETITIONS,
        ),
    ] {
        if count > limit {
            return Err(BridgeError::InvalidManifest(format!(
                "{kind} count {count} exceeds safety limit {limit}"
            )));
        }
        let expected_pages = count.div_ceil(manifest.page_size);
        if pages != expected_pages {
            return Err(BridgeError::InvalidManifest(format!(
                "{kind} declares {pages} pages, expected {expected_pages}"
            )));
        }
        total_pages = total_pages.saturating_add(pages);
    }
    if total_pages > MAXIMUM_TOTAL_PAGES {
        return Err(BridgeError::InvalidManifest(format!(
            "snapshot declares {total_pages} pages, exceeding safety limit {MAXIMUM_TOTAL_PAGES}"
        )));
    }
    Ok(())
}

fn validate_domain_roots(status: &DomainRootStatus) -> Result<(), BridgeError> {
    const MAXIMUM_ROOTS: u32 = 128;
    const MAXIMUM_PROPERTIES: u32 = 100_000;
    if status.schema_version != 1
        || status.checked_at_utc.is_empty()
        || status.checked_at_utc.len() > 128
        || status.initialiser_count > MAXIMUM_ROOTS
        || status.context_module_count > MAXIMUM_ROOTS
        || status.interop_subsystem_count > MAXIMUM_ROOTS
        || status.error.as_ref().is_some_and(|error| error.len() > 512)
    {
        return Err(BridgeError::InvalidDomainRoots(
            "metadata or root counts exceed protocol bounds".to_owned(),
        ));
    }
    let property_counts = [
        status.reference_metadata.game_properties,
        status.reference_metadata.person_properties,
        status.reference_metadata.club_properties,
        status.reference_metadata.competition_properties,
        status.reference_metadata.person_search_properties,
        status.reference_metadata.person_summary_properties,
        status.reference_metadata.club_summary_properties,
        status.reference_metadata.competition_summary_properties,
    ];
    if property_counts
        .iter()
        .any(|count| *count > MAXIMUM_PROPERTIES)
    {
        return Err(BridgeError::InvalidDomainRoots(
            "reference property count exceeds protocol bounds".to_owned(),
        ));
    }
    match status.state {
        DomainRootState::ProbeFailed => {
            if status.error.as_ref().is_none_or(String::is_empty) {
                return Err(BridgeError::InvalidDomainRoots(
                    "failed state must contain a bounded error".to_owned(),
                ));
            }
        }
        _ if status.error.is_some() => {
            return Err(BridgeError::InvalidDomainRoots(
                "only failed state may contain an error".to_owned(),
            ));
        }
        _ => {}
    }
    if status.state == DomainRootState::RootsResolved
        && (status.initialiser_count == 0
            || !status.initialisation_complete
            || status.interop_subsystem_count != 1
            || !status.database_factory_available
            || property_counts.contains(&0))
    {
        return Err(BridgeError::InvalidDomainRoots(
            "resolved state does not satisfy every root invariant".to_owned(),
        ));
    }
    Ok(())
}

fn validate_reference_catalog(catalog: &ReferenceCatalogStatus) -> Result<(), BridgeError> {
    if catalog.schema_version != 1
        || catalog.generated_at_utc.is_empty()
        || catalog.generated_at_utc.len() > 128
        || catalog
            .error
            .as_ref()
            .is_some_and(|error| error.len() > 512)
    {
        return Err(BridgeError::InvalidReferenceCatalog(
            "catalog metadata exceeds protocol bounds".to_owned(),
        ));
    }

    match catalog.state {
        ReferenceCatalogState::WaitingForGame => {
            if !catalog.references.is_empty() || catalog.error.is_some() {
                return Err(BridgeError::InvalidReferenceCatalog(
                    "waiting catalog must not expose references or an error".to_owned(),
                ));
            }
            return Ok(());
        }
        ReferenceCatalogState::CatalogFailed => {
            if !catalog.references.is_empty() || catalog.error.as_ref().is_none_or(String::is_empty)
            {
                return Err(BridgeError::InvalidReferenceCatalog(
                    "failed catalog must expose only a bounded error".to_owned(),
                ));
            }
            return Ok(());
        }
        ReferenceCatalogState::CatalogReady if catalog.error.is_some() => {
            return Err(BridgeError::InvalidReferenceCatalog(
                "ready catalog must not expose an error".to_owned(),
            ));
        }
        ReferenceCatalogState::CatalogReady => {}
    }

    if catalog.references.len() != MAXIMUM_REFERENCE_TYPES {
        return Err(BridgeError::InvalidReferenceCatalog(format!(
            "ready catalog must contain {MAXIMUM_REFERENCE_TYPES} reference types"
        )));
    }
    let expected_names = HashSet::from([
        "game",
        "person",
        "club",
        "competition",
        "person_search",
        "person_summary",
        "club_summary",
        "competition_summary",
    ]);
    let mut names = HashSet::new();
    let mut total_properties = 0_u32;
    for reference in &catalog.references {
        if !names.insert(reference.name.as_str()) {
            return Err(BridgeError::InvalidReferenceCatalog(format!(
                "reference type {} occurs more than once",
                reference.name
            )));
        }
        if reference.property_count == 0
            || reference.property_count > MAXIMUM_PROPERTIES_PER_REFERENCE
            || reference.property_count as usize != reference.properties.len()
        {
            return Err(BridgeError::InvalidReferenceCatalog(format!(
                "reference type {} has inconsistent or excessive property counts",
                reference.name
            )));
        }
        total_properties = total_properties.saturating_add(reference.property_count);
        let mut property_ids = HashSet::new();
        for property in &reference.properties {
            if !property_ids.insert(property.property_id)
                || property.description.is_empty()
                || property.description.len() > 1_024
                || property.binding_kind.is_empty()
                || property.binding_kind.len() > 128
                || property
                    .value_type
                    .as_ref()
                    .is_some_and(|value_type| value_type.len() > 512)
            {
                return Err(BridgeError::InvalidReferenceCatalog(format!(
                    "reference type {} contains invalid property metadata",
                    reference.name
                )));
            }
        }
    }
    if names != expected_names {
        return Err(BridgeError::InvalidReferenceCatalog(
            "ready catalog contains an unexpected reference type set".to_owned(),
        ));
    }
    if total_properties > MAXIMUM_TOTAL_REFERENCE_PROPERTIES {
        return Err(BridgeError::InvalidReferenceCatalog(format!(
            "catalog contains {total_properties} properties, exceeding safety limit {MAXIMUM_TOTAL_REFERENCE_PROPERTIES}"
        )));
    }
    Ok(())
}

pub fn probe_bridge(root: &Path) -> Result<BridgeProbe, BridgeError> {
    let client = BridgeClient::from_installation(root)?;
    let health = client.health()?;
    let capabilities = client.capabilities()?;
    let domain_roots = match client.domain_roots() {
        Ok(status) => Some(status),
        Err(BridgeError::Rejected(error)) if error == "unknown_method" => None,
        Err(error) => return Err(error),
    };
    Ok(BridgeProbe {
        health,
        capabilities,
        domain_roots,
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

    #[test]
    fn validates_every_invariant_before_accepting_resolved_domain_roots() {
        let mut status = DomainRootStatus {
            schema_version: 1,
            checked_at_utc: "2026-07-22T02:00:00Z".to_owned(),
            state: DomainRootState::RootsResolved,
            initialiser_count: 1,
            initialisation_complete: true,
            context_module_count: 1,
            interop_subsystem_count: 1,
            database_factory_available: true,
            reference_metadata: DomainReferenceMetadata {
                game_properties: 1,
                person_properties: 1,
                club_properties: 1,
                competition_properties: 1,
                person_search_properties: 1,
                person_summary_properties: 1,
                club_summary_properties: 1,
                competition_summary_properties: 1,
            },
            error: None,
        };
        validate_domain_roots(&status).unwrap();

        status.initialiser_count = 0;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.initialiser_count = 1;

        status.initialisation_complete = false;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.initialisation_complete = true;

        status.interop_subsystem_count = 2;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.interop_subsystem_count = 1;

        status.database_factory_available = false;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.database_factory_available = true;

        status.reference_metadata.person_properties = 0;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.reference_metadata.person_properties = 1;

        status.error = Some("unexpected".to_owned());
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));

        status.state = DomainRootState::ProbeFailed;
        status.error = None;
        assert!(matches!(
            validate_domain_roots(&status),
            Err(BridgeError::InvalidDomainRoots(_))
        ));
        status.error = Some("test failure".to_owned());
        validate_domain_roots(&status).unwrap();
    }

    #[test]
    fn requests_authenticated_domain_root_status() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(stream.try_clone().unwrap())
                .read_line(&mut line)
                .unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["method"], "domain_roots");
            assert_eq!(request["token"], "test-token");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "protocol_version": 1,
                    "id": request["id"],
                    "ok": true,
                    "result": {
                        "schema_version": 1,
                        "checked_at_utc": "2026-07-22T02:00:00Z",
                        "state": "waiting_for_game",
                        "initialiser_count": 0,
                        "initialisation_complete": false,
                        "context_module_count": 0,
                        "interop_subsystem_count": 0,
                        "database_factory_available": false,
                        "reference_metadata": {
                            "game_properties": 0,
                            "person_properties": 0,
                            "club_properties": 0,
                            "competition_properties": 0,
                            "person_search_properties": 0,
                            "person_summary_properties": 0,
                            "club_summary_properties": 0,
                            "competition_summary_properties": 0
                        },
                        "error": null
                    },
                    "error": null
                })
            )
            .unwrap();
        });

        let path = temporary_descriptor(port, 4244);
        let client = BridgeClient::from_descriptor(&path).unwrap();
        let status = client.domain_roots().unwrap();
        fs::remove_file(path).unwrap();
        server.join().unwrap();

        assert_eq!(status.state, DomainRootState::WaitingForGame);
    }

    fn ready_reference_catalog() -> ReferenceCatalogStatus {
        ReferenceCatalogStatus {
            schema_version: 1,
            generated_at_utc: "2026-07-22T04:00:00Z".to_owned(),
            state: ReferenceCatalogState::CatalogReady,
            references: [
                "game",
                "person",
                "club",
                "competition",
                "person_search",
                "person_summary",
                "club_summary",
                "competition_summary",
            ]
            .into_iter()
            .enumerate()
            .map(|(index, name)| ReferenceTypeCatalog {
                name: name.to_owned(),
                property_count: 1,
                properties: vec![ReferencePropertyMetadata {
                    property_id: index as u32 + 1,
                    description: format!("{name}.name"),
                    binding_kind: "Value".to_owned(),
                    reference_id: 0,
                    value_type: Some("System.String".to_owned()),
                }],
            })
            .collect(),
            error: None,
        }
    }

    #[test]
    fn validates_reference_catalog_states_and_unique_metadata() {
        let mut catalog = ready_reference_catalog();
        validate_reference_catalog(&catalog).unwrap();

        catalog.references[1].name = "game".to_owned();
        assert!(matches!(
            validate_reference_catalog(&catalog),
            Err(BridgeError::InvalidReferenceCatalog(_))
        ));

        catalog = ready_reference_catalog();
        let duplicate_property = catalog.references[0].properties[0].clone();
        catalog.references[0].properties.push(duplicate_property);
        catalog.references[0].property_count = 2;
        assert!(matches!(
            validate_reference_catalog(&catalog),
            Err(BridgeError::InvalidReferenceCatalog(_))
        ));

        catalog = ReferenceCatalogStatus {
            schema_version: 1,
            generated_at_utc: "2026-07-22T04:00:00Z".to_owned(),
            state: ReferenceCatalogState::CatalogFailed,
            references: Vec::new(),
            error: Some("probe failed".to_owned()),
        };
        validate_reference_catalog(&catalog).unwrap();
        catalog.error = None;
        assert!(matches!(
            validate_reference_catalog(&catalog),
            Err(BridgeError::InvalidReferenceCatalog(_))
        ));
    }

    #[test]
    fn requests_an_authenticated_reference_catalog() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let served = ready_reference_catalog();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(stream.try_clone().unwrap())
                .read_line(&mut line)
                .unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["method"], "reference_catalog");
            assert_eq!(request["token"], "test-token");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "protocol_version": 1,
                    "id": request["id"],
                    "ok": true,
                    "result": served,
                    "error": null
                })
            )
            .unwrap();
        });

        let path = temporary_descriptor(port, 4245);
        let client = BridgeClient::from_descriptor(&path).unwrap();
        let catalog = client.reference_catalog().unwrap();
        fs::remove_file(path).unwrap();
        server.join().unwrap();

        assert_eq!(catalog.state, ReferenceCatalogState::CatalogReady);
        assert_eq!(catalog.references.len(), MAXIMUM_REFERENCE_TYPES);
    }

    #[test]
    fn reads_and_validates_a_paginated_canonical_snapshot() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let pid = 4243;
        let fixture = bestscout_core::synthetic_snapshot();
        let served_fixture = fixture.clone();
        let server = thread::spawn(move || {
            for _ in 0..8 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut line = String::new();
                BufReader::new(stream.try_clone().unwrap())
                    .read_line(&mut line)
                    .unwrap();
                let request: Value = serde_json::from_str(&line).unwrap();
                let result = match request["method"].as_str().unwrap() {
                    "health" => serde_json::json!({
                        "bridge_version": "0.2.0", "pid": pid, "read_only": true
                    }),
                    "capabilities" => serde_json::json!({
                        "health": true, "domain_read": true, "domain_write": false
                    }),
                    "snapshot_manifest" => serde_json::json!({
                        "snapshot_id": "fixture-1",
                        "schema_version": 1,
                        "generated_at_utc": "2026-07-21T20:00:00Z",
                        "page_size": 1,
                        "counts": {"players": 2, "staff": 1, "clubs": 1, "competitions": 1},
                        "pages": {"players": 2, "staff": 1, "clubs": 1, "competitions": 1}
                    }),
                    "snapshot_page" => {
                        let parameters = &request["parameters"];
                        assert_eq!(parameters["snapshot_id"], "fixture-1");
                        let entity_kind = parameters["entity_kind"].as_str().unwrap();
                        let page_index = parameters["page_index"].as_u64().unwrap() as usize;
                        let all_items = match entity_kind {
                            "players" => serde_json::to_value(&served_fixture.players).unwrap(),
                            "staff" => serde_json::to_value(&served_fixture.staff).unwrap(),
                            "clubs" => serde_json::to_value(&served_fixture.clubs).unwrap(),
                            "competitions" => {
                                serde_json::to_value(&served_fixture.competitions).unwrap()
                            }
                            other => panic!("unexpected entity kind {other}"),
                        };
                        let all_items = all_items.as_array().unwrap();
                        serde_json::json!({
                            "snapshot_id": "fixture-1",
                            "entity_kind": entity_kind,
                            "page_index": page_index,
                            "page_count": all_items.len(),
                            "items": [all_items[page_index].clone()]
                        })
                    }
                    method => panic!("unexpected method {method}"),
                };
                writeln!(
                    stream,
                    "{}",
                    serde_json::json!({
                        "protocol_version": 1,
                        "id": request["id"],
                        "ok": true,
                        "result": result,
                        "error": null
                    })
                )
                .unwrap();
            }
        });

        let path = temporary_descriptor(port, pid);
        let client = BridgeClient::from_descriptor(&path).unwrap();
        let snapshot = client.read_snapshot().unwrap();
        fs::remove_file(path).unwrap();
        server.join().unwrap();

        assert_eq!(snapshot.source, SnapshotSource::Live);
        assert_eq!(snapshot.players, fixture.players);
        assert_eq!(snapshot.staff, fixture.staff);
        assert_eq!(snapshot.clubs, fixture.clubs);
        assert_eq!(snapshot.competitions, fixture.competitions);
    }

    #[test]
    fn rejects_manifest_counts_that_exceed_the_safety_limit() {
        let manifest = SnapshotManifest {
            snapshot_id: "too-large".to_owned(),
            schema_version: CURRENT_SCHEMA_VERSION,
            generated_at_utc: "2026-07-21T20:00:00Z".to_owned(),
            page_size: 1_000,
            counts: SnapshotEntityCounts {
                players: MAXIMUM_PLAYERS + 1,
                staff: 0,
                clubs: 0,
                competitions: 0,
            },
            pages: SnapshotPageCounts {
                players: (MAXIMUM_PLAYERS + 1).div_ceil(1_000),
                staff: 0,
                clubs: 0,
                competitions: 0,
            },
        };
        assert!(matches!(
            validate_manifest(&manifest),
            Err(BridgeError::InvalidManifest(_))
        ));
    }
}
