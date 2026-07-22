# Player availability architecture

BestScout represents fitness, morale, injuries and bans in the canonical player
model rather than as UI-only annotations. This keeps imported, synthetic,
save-game and live snapshots on the same validated contract and prevents a live
adapter from bypassing editor safety.

## Canonical data

Each player can carry condition, match fitness, fatigue and jadedness on a
0–100 scale, plus morale and happiness on a 1–20 scale. Injury records contain a
bounded identifier, description, body area, severity, start and expected-return
date, remaining days, recurrence and treatment. Ban records carry scope,
competition, dates and remaining matches. The snapshot may include the current
in-game date so active records are evaluated against game time, not wall-clock
time.

Snapshot validation rejects invalid ranges, dates, duplicate record IDs,
oversized collections and references to unknown competitions. Older payloads
remain compatible because the added detail fields deserialize to empty or
unknown values instead of fabricated measurements.

## Deterministic analysis

`analyse_player_availability` validates the complete snapshot and configurable
thresholds before producing one row per player. Active injuries, active bans and
explicit injured/suspended/unavailable flags make a player unavailable. Low
condition or high fatigue makes the player doubtful. Match fitness, jadedness,
morale and happiness can mark a player for managed workload.

Every classification includes its evidence and a bounded 0–100 availability
score. Missing measurements are shown as unknown and never replaced with an
assumed healthy value. Results sort by urgency, score and stable player identity.

## Correction actions

The workspace exposes five deliberate actions:

- restore condition and match fitness while clearing fatigue and jadedness;
- clear injury records and the injured flag;
- clear ban records and the suspended flag;
- stabilize morale and happiness;
- combine all of the above and clear the unavailable flag for match readiness.

An action accepts at most 250 unique, explicitly selected player IDs. It reads
the current canonical fields, skips no-op values and creates exact
`expected_before` operations. The ordinary editor engine then validates the
entire preview atomically. Missing players, stale values and invalid resulting
snapshots reject the complete action.

Commit uses the existing private backup and hash-chained journal store. The
availability feature therefore has no separate mutation route and inherits
conflict detection, exact undo and future live read-back verification. Live
writes remain disabled until the FM26 field adapter passes its own acceptance
gates.
