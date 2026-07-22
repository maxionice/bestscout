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

## Contract terms

Player and staff contracts carry backward-compatible lists of typed bonuses and
clauses. Ten bonus kinds cover signing, loyalty, appearance, substitute, goal,
assist, clean-sheet, cap, team-of-the-year and promotion payments. Eleven
clause kinds cover release values, sell-on percentages, wage changes and
extension triggers. Clause values are explicitly tagged as money, percentage
or count; snapshot validation rejects a value category that does not match the
clause kind.

IDs and kinds are unique per contract, lists contain at most 32 items, monetary
values are finite and limited to one trillion, percentages are 0–100, extension
years are 1–5 and appearance triggers are 1–1000. The legacy single release-clause field remains readable for old
snapshots. The Transfer Center writes a matching typed minimum-fee clause for
new contracts and offers the common signing, appearance, goal, sell-on and
annual-rise terms. Every supported term remains available through the generic
validated editor and searchable database tables.

## Actions

`prepare_transfer_action` supports an immediate move, arranging or replacing a
future agreement, cancelling an agreement and completing a due agreement. It
also supports immediate reciprocal swaps, atomic future-swap arrangement and
atomic completion of a due future swap.
Immediate and completed moves update the player-facing club name, canonical
contract and future-transfer record atomically. Because registrations are bound
to the current contract club, the same transaction clears the player's previous
competition registrations. The destination contract club ID is derived from the
selected destination instead of trusting conflicting UI input.

Completion requires a canonical in-game date at or after the effective date. A
loan requires a loan contract. A swap requires two different contracted players
at different clubs and two complete permanent target contracts. Both club names,
both contracts and both future-transfer records are changed by the same editor
transaction. Future swaps use two unique inverse records; arrangement,
cancellation and due completion always touch both records together. The ordinary
single-player commands reject swap records, so BestScout cannot prepare half of
a swap through the transfer API. Immediate and completed swaps also clear both
players' previous competition registrations atomically; arranging or cancelling
a future swap leaves registrations unchanged.

Target-contract bonus and clause drafts are built for each side independently.
Stable term IDs make repeated previews deterministic. Staff reassignment keeps
existing typed terms unless they are intentionally changed through the editor.

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
