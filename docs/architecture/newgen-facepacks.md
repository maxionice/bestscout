# Newgen facepack architecture

BestScout assigns existing local PNG or JPEG portraits to explicitly selected
FM newgens. It does not generate, download or upload images and it never edits a
save game. Image licensing and permission remain the user's responsibility.

## Explicit identity gate

Age, ability and high numeric IDs are not reliable newgen evidence. The workspace
therefore accepts only players with a numeric FM unique ID and requires the user
to explicitly confirm that every selected player is a newgen. Both plain numeric
IDs and already prefixed `r-` IDs normalize to one canonical FM target of the
form `r-<UID>`. Zero, non-numeric, duplicate and missing IDs are rejected.

## Deterministic assignment

The plan sorts canonical player IDs numerically and ranks every image by SHA-256
over a domain separator, the user-provided seed, filename and content hash. It
then assigns without replacement. Reordering the player snapshot or source
directory cannot change the plan; changing source bytes or the seed creates a
different plan hash. Duplicate image bytes are rejected so two selected newgens
cannot silently receive the same portrait.

Generated filenames contain only the canonical numeric UID. `config.xml` maps
each resource to `graphics/pictures/person/r-<UID>/portrait` and contains no
player names or source paths.

## Filesystem transaction

The source and destination must be existing, regular, non-symbolic and
non-overlapping directories. Scanning is limited to 10,000 direct PNG/JPG/JPEG
files, 32 MiB per file and 8 GiB in total. Files must decode successfully and are
limited to 4096 pixels per axis and 16,777,216 pixels overall. Device, inode and
length are checked across opening to detect path replacement.

Installation recomputes the whole preview and requires its exact plan hash. It
writes copies, `config.xml` and a private manifest into a protected sibling
staging directory, syncs every file and directory, then activates the pack with
Linux `RENAME_NOREPLACE`. Existing targets and transaction residue are never
overwritten, including if another process creates one after preview. A failed
parent-directory sync attempts to restore the pre-activation state.

Removal parses a bounded, strict manifest and verifies the exact directory entry
set, every image size/hash and the configuration hash. Unknown, symbolic, missing
or modified files stop the operation. Only a completely verified managed folder
is atomically renamed out of service without replacement, then its manifest and
contents are verified a second time before removal; there is no force option.

After activation the user performs the normal custom-graphics/skin refresh in
Football Manager. BestScout does not start, close or control FM.
