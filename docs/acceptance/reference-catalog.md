# FM26 reference catalog acceptance

Profile: `fm26-steam-23583635`

Bridge candidate: `0.5.0`

## Automated evidence

- Catalog construction runs only from the existing Unity main-thread probe and
  only after every domain-root invariant resolves.
- Exactly eight allowlisted FM26 reference families are collected: game, person,
  club, competition, person search, and the three database summary references.
- The bridge caps each family at 10,000 properties and the complete immutable
  catalog at 20,000 properties.
- Every property contains a numeric ID, bounded description, binding kind,
  referenced type ID and optional bounded value type. Empty descriptions receive
  a deterministic property-ID fallback.
- Duplicate property IDs abort construction. A failure returns a bounded state
  and never enables `domain_read`.
- The Rust client independently requires protocol schema 1, a valid state,
  the exact eight-name set, consistent counts, unique IDs, bounded strings and
  the same total limits.
- The authenticated transport test verifies the method and per-launch token;
  malformed catalog-state and duplicate-property tests are rejected.
- `bestscout-reference-catalog` parses game paths without shell assumptions and
  prints only a catalog that passed the Rust validator.
- The bridge compiles in Release mode against the exact local generated FM26
  assemblies with zero warnings and zero errors. All references remain
  `Private=false`, so no proprietary assembly is copied into BestScout output.

## Pending real Proton evidence

The current FM26 process predates this bridge candidate. The lifecycle gate
correctly forbids replacing game plugins while that process runs, so no plugin
was copied or injected. After a normal shutdown and managed install, acceptance
requires:

1. Restart FM26 and load the selected test career.
2. Confirm bridge `0.5.0`, resolved domain roots and `catalog_ready`.
3. Persist the catalog only as local compatibility evidence and verify all eight
   families, counts and IDs with the Rust command.
4. Confirm `domain_read = false` until the entity-channel adapter separately
   passes canonical snapshot acceptance.
