# Transfer Center acceptance — 2026-07-22

## Implemented scope

- Canonical permanent, loan, free and swap agreement records
- Origin, destination, fee, dates, wage contribution and lifecycle validation
- Immediate player moves with a destination-bound contract
- Future permanent, loan and free-transfer planning
- Due-date-controlled completion and explicit cancellation
- Reciprocal immediate and future player swaps with two target contracts
- Atomic two-player swap arrangement, cancellation and due completion
- Complete database columns and generic JSON editor access
- Dark HeroUI v3 Transfer Center in the custom frameless shell
- Exact preview, private backup, journal and undo through the shared editor core

## Automated acceptance

- Future agreements validate every nested reference, date and financial bound.
- An agreement with a mismatched origin is rejected.
- A same-club immediate move is rejected.
- Invalid loan terms fail whole-snapshot preview validation.
- A future transfer cannot complete before its in-game effective date.
- Completion changes club, contract and agreement atomically with exact
  expectations.
- UI tests require an explicit destination, verify the prepared route and commit
  only through the transfer journal gateway.
- Cancellation targets only the selected player's existing agreement.
- A swap requires an explicit partner contracted to the other club.
- A one-sided or mismatched swap record fails whole-snapshot validation.
- Immediate swaps change both club memberships and both contracts in one exact
  transaction.
- Future swap arrangement and cancellation update both inverse records together.
- A future swap cannot complete before its shared effective date.
- Missing players, same-club partners, invalid target contracts and stale data
  reject the complete swap without a partial mutation.
- UI tests require a destination and swap partner and send both target contracts
  for immediate and due future swaps.

## Remaining acceptance gates

- Repeat rendered density, keyboard and interaction review in a native Tauri
  window.
- Map club membership, contract and future-transfer fields in the exact FM26
  reader/writer and verify live read-back plus undo.
- Test immediate, future, loan and reciprocal swap operations on the supported
  FM26 build after the bridge is installed on a clean restart.

Canonical immediate, future, loan and reciprocal swap behavior is complete. The
1.0 transfer parity gate remains open until native interaction review and live
adapter acceptance pass.
