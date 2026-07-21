# Live-access architecture

BestScout separates discovery, process inspection, domain reading and editing.
Finding a process does not imply that its memory layout is understood.

## Capability gates

1. **Installation discovery** locates Steam/Proton and the three relevant IL2CPP
   artifacts.
2. **Build verification** compares the Steam build ID and all SHA-256 hashes with
   an allowlisted profile.
3. **Process inspection** parses `/proc/<pid>/maps` and resolves module bases.
4. **Domain reading** becomes available only after a profile contains validated
   entity roots, schemas and invariants and an authenticated bridge reports the
   same capability for the running FM process.
5. **Domain writing** additionally requires field-level validation, a transaction
   journal, read-back verification and undo data.

Unknown or partially matching builds receive no capabilities.

## Native read-only layer

`bestscout-live` contains a `ReadOnlyProcessMemory` type. It has no write method,
rejects ranges that are not fully contained in one readable mapping and limits a
single read to 16 MiB. Module bases account for mapping offsets and ASLR.

Raw bytes never go directly to the UI. Future domain adapters must decode them
into the canonical model and validate entity IDs, value ranges and relationships.

## IL2CPP bridge direction

FM26 exposes generated BepInEx/Il2CppInterop assemblies in a local installation.
The `BestScout.Bridge` scaffold runs inside the same Proton prefix and provides a
versioned localhost protocol. Its current health and capability handshake is
read-only; domain methods remain disabled until their adapters are validated.

The repository will not redistribute Football Manager assemblies. Bridge builds
must reference files from the user's own installation, and the protocol must bind
to loopback with per-launch authentication. The native read-only adapter remains
available for build diagnostics and independently validated entity readers.
