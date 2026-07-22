# FM26 domain-root probe plan

This record defines the pending runtime acceptance for the read-only domain-root
probe on profile `fm26-steam-23583635`. It is intentionally not an acceptance
record yet: the game was already running while bridge version 0.3 was built, so
the new plugin was not copied into or injected into that process.

## Implemented gates

- The probe runs from a BepInEx-managed Unity component on the game thread and
  polls no more than once every two seconds.
- It verifies completed FM initialisation, exactly one live game-interop root,
  the database-record reference factory and populated typed reference metadata.
- It opens no channel, enumerates no save entity and exposes no property IDs.
- The status travels through the existing loopback-only, per-launch authenticated
  protocol. Rust independently bounds and validates the response.
- `domain_read` and `domain_write` remain false regardless of probe state.

## Acceptance after a clean FM restart

1. Close FM26 normally and confirm that no real `fm.exe` process remains.
2. Build the bridge against the exact local interop assemblies and copy only
   `BestScout.Bridge.dll` into its own BepInEx plugin directory.
3. Start FM26, load the synthetic test career and confirm bridge version 0.3.
4. Require `domain_roots.state = roots_resolved`, exactly one interop subsystem,
   a live database factory and non-zero counts for all eight reference groups.
5. Re-run detection at the main menu and after reloading the save to verify clean
   waiting/resolved transitions without errors or game instability.
6. Remove the plugin and verify that FM26 returns to its original state.

Only after this evidence is recorded may the roadmap item “Resolve validated
FM26 domain roots” be checked and work begin on bounded entity channels.
