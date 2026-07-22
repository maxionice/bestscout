# Transfer architecture

BestScout models transfers as canonical player data and converts every action
into the ordinary editor transaction format. There is no transfer-specific
write shortcut.

## Future-transfer record

A future transfer contains a bounded unique ID, permanent/loan/free/swap kind,
origin and destination club IDs, arranged and effective in-game dates, fee,
optional loan end and wage contribution, optional swap player and lifecycle
status. Snapshot validation enforces:

- existing club and player references;
- different origin and destination clubs;
- valid and ordered game dates;
- finite bounded fees and a 0–100 wage contribution;
- an end date only for loans and a partner only for swaps;
- a reciprocal inverse agreement for every swap, with matching players, clubs,
  dates and lifecycle state;
- zero fee for a free transfer;
- globally unique transfer IDs.

Older snapshots remain compatible because `future_transfer` defaults to null.
The full record is visible in the generic database and editor as well as the
dedicated Transfer Center.

## Actions

`prepare_transfer_action` supports an immediate move, arranging or replacing a
future agreement, cancelling an agreement and completing a due agreement. It
also supports immediate reciprocal swaps, atomic future-swap arrangement and
atomic completion of a due future swap.
Immediate and completed moves update the player-facing club name, canonical
contract and future-transfer record atomically. The destination contract club ID
is derived from the selected destination instead of trusting conflicting UI
input.

Completion requires a canonical in-game date at or after the effective date. A
loan requires a loan contract. A swap requires two different contracted players
at different clubs and two complete permanent target contracts. Both club names,
both contracts and both future-transfer records are changed by the same editor
transaction. Future swaps use two unique inverse records; arrangement,
cancellation and due completion always touch both records together. The ordinary
single-player commands reject swap records, so BestScout cannot prepare half of
a swap through the transfer API.

Each changed field carries the exact value read for preview as
`expected_before`. Applying the prepared transaction therefore rejects stale
club, contract or agreement data from either player and leaves the source
snapshot untouched. Whole-snapshot validation additionally rejects a one-sided
swap created through the generic editor.

## Safety and live boundary

Commit reuses the private snapshot backup, hash-chained journal, whole-snapshot
validation and exact undo engine. The native FM26 adapter will additionally need
field-level write mapping and read-back verification for club membership,
contract ownership and future-transfer objects before live transfer actions can
be enabled.
