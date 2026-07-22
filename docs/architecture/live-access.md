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
versioned localhost protocol. A thread-safe immutable cache exposes a manifest
and bounded pages for players, staff, clubs and competitions. Every page carries
the snapshot ID and page metadata, so the client rejects torn or changed reads.
The Rust client caps entity counts and response size, reconstructs the canonical
snapshot and runs full schema and relationship validation before returning data
to Tauri. Domain publication remains disabled until its FM26 adapter is
validated.

Before any entity channel is opened, bridge version 0.3 runs a bounded probe on
Unity's main thread. It requires a completed FM initialiser, exactly one live game
interop subsystem, the database-record reference factory and non-empty metadata
for the game, person, club, competition, person-search and database-summary
references. The authenticated `domain_roots` response contains only state,
counts and a bounded error; it does not expose save data or numeric property IDs.
Rust validates every count and the complete `roots_resolved` invariant set before
showing the result. This is a prerequisite for, not permission to perform,
domain reads.

The repository will not redistribute Football Manager assemblies. Bridge builds
must reference files from the user's own installation, and the protocol must bind
to loopback with per-launch authentication. The native read-only adapter remains
available for build diagnostics and independently validated entity readers.
