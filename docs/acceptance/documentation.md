# Bilingual documentation acceptance — 2026-07-22

The English and German user guides cover the same twelve ordered topics: safety,
packages, first start, scouting, canonical workspaces, editing, live access,
facepacks, local data, release verification, troubleshooting and current limits.

`scripts/verify-docs.test.mjs` enforces the topic sequence, numbered-section
count, absence of unfinished placeholders and resolution of every local Markdown
link in the root documentation set. Linked targets must be regular non-symlink
files inside the repository.

Acceptance command:

```text
node --test scripts/*.test.mjs
```

This closes the 1.0 bilingual user-documentation item. Individual architecture
and historical acceptance records retain their original working language; the
two user guides provide the complete supported workflow in both languages.
