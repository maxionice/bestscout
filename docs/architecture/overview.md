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
