//! Safe discovery and compatibility checks for Football Manager under Linux/Proton.
//!
//! This crate deliberately contains no memory writer. Process access is only
//! enabled after a version profile has matched an executable fingerprint.

mod discovery;
mod fingerprint;

pub use discovery::{FmInstallation, FmProcess, LiveEnvironment, discover_environment};
pub use fingerprint::{ExecutableFingerprint, FingerprintError, fingerprint_file};
