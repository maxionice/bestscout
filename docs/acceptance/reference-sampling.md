# FM26 reference sampling acceptance

Profile: `fm26-steam-23583635`

Bridge candidate: `0.5.0`

## Automated evidence

- Sampling remains unavailable until `domain_roots = roots_resolved` and the
  independently bounded eight-family catalog is `catalog_ready`.
- The server accepts exactly the catalog family names. Person, club and
  competition require an index from 0 through 5,000,000; singleton/search/summary
  references reject an index.
- Each request contains 1 through 32 distinct property IDs. Every ID must already
  occur in that family's immutable runtime catalog.
- Only one queued or running request is allowed. Requests and status reads use the
  existing random per-launch token and loopback-only protocol.
- Typed references, `PropertyID`, `OpenChannel`, callback processing and
  `CloseChannel` all execute from the existing Unity behaviour. The network thread
  only validates/enqueues work and reads immutable status.
- A request finishes after every value arrives or after a five-second timeout.
  Completion, timeout, failure, subsystem replacement and plugin unload all close
  every opened key best-effort.
- Value text is capped at 2,048 characters, type names at 256, errors at 512, and
  reported sizes at one TiB in the independent Rust validator. Unreceived and null
  results cannot smuggle inconsistent value metadata.
- Rust tests cover state invariants, malformed/oversized results and an
  authenticated start/poll exchange. CLI tests cover paths with spaces, indexed
  targets, repeated properties, duplicate singleton options and unknown options.
- The bridge targets the exact BepInEx host runtime (`net6.0`). Compiler-only
  nullable attributes are assembly-local, and Release builds against the exact
  generated FM26 assemblies complete with zero warnings and zero errors. All
  FM/SI references remain `Private=false`.
- The sampler never calls `DomainSnapshotStore.PublishCanonicalJson`; therefore
  `domain_read` remains false. No write-capable API is referenced or exposed.

## Pending real Proton evidence

After the user independently starts FM26 and loads the selected test career:

1. Require bridge `0.5.0`, `roots_resolved` and `catalog_ready`.
2. Persist the catalog locally and choose only exact property IDs whose
   descriptions and binding types match the intended canonical fields.
3. Sample a known person, club and competition index in batches no larger than 32.
4. Confirm value type/text/size stability after a normal save reload and verify
   that every request reaches `completed` or a bounded terminal state.
5. Confirm the BepInEx log contains no channel-cleanup warning and FM remains
   stable after timeout, bridge disconnect and normal shutdown.
6. Keep `domain_read = false` until a separately reviewed adapter maps, validates
   and publishes a complete canonical snapshot.
