# FM26 domain-root probe plan

This record defines the pending runtime acceptance for the read-only domain-root
probe on profile `fm26-steam-23583635`. It is intentionally not an acceptance
record yet. Managed bridge 0.4 was later found by BepInEx but rejected before
`Load()` because the artifact targeted .NET 8 while the host runs .NET 6.0.7.
Candidate 0.5 now targets that exact runtime, but was not installed into the
already-running process.

## Implemented gates

- The probe runs from a BepInEx-managed Unity component on the game thread and
  polls no more than once every two seconds.
- It verifies completed FM initialisation, exactly one live game-interop root,
  the database-record reference factory and populated typed reference metadata.
- It opens no channel and enumerates no save entity. After all roots resolve, it
  captures an immutable, bounded property catalog for eight allowlisted reference
  families so the entity adapter can be mapped from runtime evidence.
- The status travels through the existing loopback-only, per-launch authenticated
  protocol. Rust independently bounds and validates the response.
- `domain_read` and `domain_write` remain false regardless of probe state.

## Acceptance after a clean FM restart

1. Close FM26 normally and confirm that no real `fm.exe` process remains.
2. Build the bridge against the exact local interop assemblies and copy only
   `BestScout.Bridge.dll` into its own BepInEx plugin directory.
3. Start FM26, load the synthetic test career and confirm bridge version 0.5.
4. Require `domain_roots.state = roots_resolved`, exactly one interop subsystem,
   a live database factory and non-zero counts for all eight reference groups.
5. Require `reference_catalog.state = catalog_ready`, exactly the eight expected
   reference families, consistent counts and unique bounded property IDs.
6. Re-run detection at the main menu and after reloading the save to verify clean
   waiting/resolved transitions without errors or game instability.
7. Remove the plugin and verify that FM26 returns to its original state.

Only after this evidence is recorded may the roadmap item “Resolve validated
FM26 domain roots” be checked and property mappings may be promoted into bounded
entity channels.
