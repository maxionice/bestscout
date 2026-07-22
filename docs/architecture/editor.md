# Editor architecture

BestScout separates canonical editing from build-specific game writes. The
current transaction engine can safely preview and transform validated snapshots;
it does not grant permission to modify the running FM26 process.

## Canonical transaction

Each operation identifies an entity and a whitelisted field, supplies the exact
value observed during preview and proposes a replacement. A transaction is
accepted only when all operations still match, all values deserialize into the
canonical model and the complete resulting snapshot passes cross-entity and range
validation. Processing happens on a clone, so a rejected operation cannot leave a
partial result.

An accepted result records every before/after value plus SHA-256 hashes of the
complete snapshots. Undo is another validated transaction in reverse order and is
allowed only against the exact committed snapshot. The restored hash must match
the original hash byte for byte.

## Local persistence

Before an edit or undo is returned, Tauri stores content-addressed backups of both
the previous and resulting snapshots and atomically replaces the save-specific
journal. This makes the verified journal head restorable after an application
restart. Journal entries form a hash chain, use unique transaction IDs and are
revalidated when loaded. Linux backup and journal directories use mode `0700`;
files use mode `0600`.

The HeroUI workspace never calls the persistent command directly from a field
input. Changes are staged first, then sent through a non-persistent core preview.
Only that exact preview transaction can be committed. The workspace exposes all
canonical player, staff, club and competition edit fields, including all 47 player
and 16 staff attributes, and keeps live-write capability visibly separate from
offline snapshot editing.

## Future live commit

A build adapter may expose a live commit only after both the local compatibility
profile and the authenticated in-process bridge approve the exact FM build and
field map. The commit sequence is:

1. Read a fresh canonical snapshot and compare every preview value.
2. Persist the pre-write backup.
3. Apply the bounded field writes as one adapter transaction.
4. Read the affected entities back and validate a fresh canonical snapshot.
5. Verify the expected snapshot hash, then append the journal entry.
6. On any failure, restore the recorded values and verify the rollback.

Until that adapter exists and passes a real-build acceptance test, `editor_allowed`
remains false and no live write API is reachable.
