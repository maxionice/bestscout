# Architecture

BestScout uses ports and adapters so game-version-specific reverse engineering
cannot leak into the UI or domain model.

```text
React/Tauri UI
      |
Application commands
      |
Domain model + scoring + editor transaction engine
      |
DataSource / LiveReader / LiveWriter traits
      +-- CSV and HTML imports
      +-- savegame adapter
      +-- native Linux process adapter
      `-- optional helper inside the Proton prefix
```

Live writes are never exposed directly. A change set must pass schema validation,
build compatibility, target identity and range checks. The writer records original
bytes/values, applies the change, reads it back and commits the journal only after
verification.

The adapter-independent transaction and persistence design is specified in the
[editor architecture](editor.md).

The current, not-yet-accepted advanced-editor draft for staff assignments,
languages, registrations, qualifications and relationships is documented in
the [People architecture](people.md). Its explicit open gates are tracked in
the [People acceptance record](../acceptance/people.md).

The canonical club command layer, competition references, finance/stadium/
facility validation and the specialized UI are documented in the
[club architecture](clubs.md). Native and live gates remain separate in the
[club acceptance record](../acceptance/clubs.md).

## Canonical snapshots and queries

All adapters produce a schema-versioned `DatabaseSnapshot` containing players,
staff, clubs and competitions. The core query protocol supports deterministic
cross-entity search plus recursively composable player filters (`all`, `any`,
`not`), sorting, role scores and pagination. It is serializable across the Tauri
boundary so the desktop UI never needs adapter-specific filtering rules.

Synthetic fixtures exercise cross-entity links without shipping proprietary or
real-world Football Manager database content.

Derived scouting insights are isolated from adapter code as well. The
[scout-intelligence engine](scout-intelligence.md) documents its original
projection heuristic, confidence model and deterministic smart-list rules.
