# Attribute freezer architecture

BestScout models a freezer as a versioned collection of field-level baselines.
The model is independent from FM memory addresses: rules point to canonical
entity IDs and editor field paths, so the same validation can be used for an
offline working copy and, after adapter acceptance, a live FM26 snapshot.

## Rule policies

Every rule chooses its own policy:

- `exact` treats every value different from the baseline as a violation;
- `allow_increase` accepts equal or greater numeric values and treats decreases
  as violations;
- `monitor_only` reports changes without creating a correction.

Plans are limited to 5,000 unique entity/field pairs. Identifiers, timestamps,
field paths, names and serialized baselines are bounded. `allow_increase` rejects
non-numeric baselines. Plans also record the snapshot source and cannot be
evaluated against a different source class.

## Evaluation

Evaluation first validates the plan and the complete canonical snapshot. It then
reads every baseline target and produces one deterministic observation with the
current value, numeric delta and one of these states:

- unchanged;
- allowed increase;
- monitored change;
- violation;
- missing entity, missing field or type mismatch.

Missing or incompatible targets remain visible in the report. They are never
silently discarded. A correction is blocked while any rule is unresolved, which
prevents a partially enforced plan from appearing successful.

## Correction transaction

Only violations from an enabled plan become editor operations. Each operation
uses the value from the just-created report as its exact `expected_before` and
the captured baseline as `after`. The complete operation set is run through the
ordinary canonical transaction engine before the UI enables commit.

Commit uses the existing editor store, so a correction receives private
before/after backups, a hash-chained journal entry, conflict rejection, full
snapshot validation and exact undo. An allowed increase or monitor-only change
can never appear in the generated correction transaction.

## Persistence and lifecycle

The native desktop stores every plan as one atomically replaced JSON document.
The plan directory is mode `0700` on Linux and documents are mode `0600`.
Loaded documents are size-bounded, schema-validated and required to match their
validated plan ID filename. Deletion requires an explicit two-step UI action.

The current implementation checks and corrects only when the user requests it.
Automatic live enforcement remains gated on a validated FM26 field adapter, a
stable loaded-save identity and a main-thread scheduling policy. No timer or
background loop may obtain live-write capability by itself.
