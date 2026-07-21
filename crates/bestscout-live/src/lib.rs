//! Safe discovery and compatibility checks for Football Manager under Linux/Proton.
//!
//! This crate deliberately contains no memory writer. Process access is only
//! enabled after a version profile has matched an executable fingerprint.

mod bridge;
mod discovery;
mod fingerprint;
mod process;
mod profile;

pub use bridge::{
    BridgeCapabilities, BridgeClient, BridgeDescriptor, BridgeError, BridgeHealth, BridgeProbe,
    probe_bridge,
};
pub use discovery::{FmInstallation, FmProcess, LiveEnvironment, discover_environment};
pub use fingerprint::{
    BuildFingerprint, ExecutableFingerprint, FingerprintError, fingerprint_file,
};
pub use process::{
    MemoryPermissions, MemoryRegion, ProcessError, ProcessInspection, ProcessMap,
    ReadOnlyProcessMemory, inspect_process, parse_maps, read_process_map,
};
pub use profile::{
    Capabilities, CompatibilityProfile, CompatibilityReport, CompatibilityStatus, ProfileError,
    builtin_profiles, match_profile,
};
