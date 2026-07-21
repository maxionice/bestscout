# FM26 role model

FM26 replaces the former role-and-duty system with separate in-possession and
out-of-possession roles. BestScout models those phases explicitly and does not
offer obsolete duties.

## Verified inventory

The catalog was checked against the generated interop metadata from the locally
owned Steam build `23583635` and the official FM26 tactics description. It
contains:

- 47 active in-possession roles
- 39 active out-of-possession roles
- 47 technical, mental, physical and goalkeeping attributes

Legacy compatibility names can remain inside generated game assemblies. Mezzala,
Enganche and Trequartista are excluded because Sports Interactive explicitly
removed them from FM26's active role system.

Only independently authored identifiers, labels and explainable attribute
weights are stored in BestScout. The repository does not contain game assemblies,
numeric enum values, localization assets or proprietary rating formulas.

Reference: [Sports Interactive — In Possession, Out of Possession: FM26's New
Tactical Evolution](https://www.footballmanager.com/fm26/features/possession-out-possession-fm26s-new-tactical-evolution).

## Rating semantics

Every role profile declares a phase, positional family and positive attribute
weights. `score_player` reports a normalized 0–100 attribute score, coverage and
the contribution of each observed attribute. Missing attributes reduce coverage
rather than silently counting as zero.

The result is an independent scouting score, not a claim to reproduce Football
Manager's private five-star calculation. Position familiarity will be reported as
a separate factor once the live adapter exposes validated familiarity values.
