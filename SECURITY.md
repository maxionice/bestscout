# Security policy

BestScout will eventually inspect and modify a running local game process. A bad
write can corrupt a save or crash the game. Live adapters therefore default to
read-only and reject unknown executable builds.

Canonical editor transactions require an exact expected value for every field,
validate the entire result and never mutate the input snapshot on failure. Before
an accepted transaction or undo, the desktop stores a content-addressed snapshot
backup and appends a hash-linked journal. On Linux these files and their immediate
directories are created with owner-only permissions. A future live writer must
also verify the game's read-back before it may report a commit as successful.

Editor data may contain names, notes and financial details from a private save.
Backups and journals therefore stay below the platform-specific BestScout app-data
directory and are never included in diagnostics or telemetry.

Do not open public issues containing savegames, process dumps, tokens or personal
data. Report security-sensitive problems privately through GitHub Security
Advisories once the repository is online.
