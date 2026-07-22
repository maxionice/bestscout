# Current development handoff

Stand: 2026-07-22, Europe/Berlin

Dieses Dokument ist der verbindliche Einstiegspunkt für die nächste
Arbeitssitzung. Es trennt den stabilen öffentlichen Stand, die vier
gestapelten kanonischen Editor-Meilensteine und die weiterhin gesperrte
FM26-Live-Grenze.

## Repository und Pull Requests

- Lokaler Pfad: `/home/maxi/Dokumente/bestscout`
- Öffentliches Repository: `https://github.com/maxionice/bestscout`
- Stabiler `main`: `cb2191b225145098e285d733ebab57d0dca1423e`
- Letzter gemergter Meilenstein: PR #24, vollständiges Transfer Center
- People-Branch: `agent/staff-registrations-relationships`
- People-Head: `e1a1341a0aa6ba20c7cb50ab6f10ca6fb9474dc3`
- People-Draft-PR: `https://github.com/maxionice/bestscout/pull/25`
- Club-Branch: `agent/club-finance-facilities`
- Club-Produktcommit: `3744a48b8495c985e5fdb8c57acbb6f37853523e`
- Gestapelter Club-Draft-PR: `https://github.com/maxionice/bestscout/pull/26`
- Wettbewerbs-Branch: `agent/competitions-fixtures-stages`
- Wettbewerbs-Produktcommit: `47196988e4ed25c030381dff09e25d079cbb69d6`
- Gestapelter Wettbewerbs-Draft-PR: `https://github.com/maxionice/bestscout/pull/27`
- Aktueller Branch: `agent/live-domain-readers`
- Live-Reader-Produktcommit: `760c945ac650211853e65bbad70ffc436f2cd109`
- Gestapelter Live-Reader-Draft-PR: `https://github.com/maxionice/bestscout/pull/28`
- PR #26 basiert bewusst auf dem People-Branch, nicht direkt auf `main`.
- PR #27 basiert bewusst auf dem Club-Branch.
- PR #28 basiert bewusst auf dem Wettbewerbs-Branch.

PR #25, PR #26, PR #27 und PR #28 waren beim letzten Abruf offen, als Draft markiert
und mergebar. Auf allen drei veröffentlichten Produktständen waren jeweils
alle sechs GitHub-Actions-Jobs grün; die sechs Jobs für PR #28 liefen noch. Es gab
keine offenen Reviewhinweise.

## People-Meilenstein

PR #25 implementiert den kanonischen People-, Staff- und Registrierungsblock:

- Sprachen, typisierte Beziehungen und Wettbewerbregistrierungen;
- Staff-Rollen, Verantwortungen, Verträge, Profil und Qualifikationen;
- snapshotweite IDs, Referenzprüfung, Werte-/Datumsgrenzen und Serde-Defaults;
- zweiphasige `PeopleCommand`-Aktionen mit exaktem `expected_before`;
- HeroUI-v3 People & Registration Center mit vier Modi;
- Verwerfen synchroner/asynchroner stale Previews und Formular-Resync;
- atomare Löschung veralteter Registrierungen bei vollzogenem Transfer.

Details stehen in [`docs/architecture/people.md`](architecture/people.md),
[`docs/acceptance/people.md`](acceptance/people.md) und im historischen
[`docs/worklog/2026-07-22-people-wip.md`](worklog/2026-07-22-people-wip.md).

## Club-Meilenstein

PR #26 ergänzt auf dieser Basis:

- rückwärtskompatibles optionales `Club.competition_id`;
- referenzielle Konsistenz zwischen Wettbewerbs-ID und Anzeigename;
- validierte Clubtexte, Reputation und Profistatus;
- endliche Finanzwerte, nichtnegative Budgets/Schulden und negative Bilanzen;
- Stadionkapazitäts-/Zuschauerinvarianten sowie Anlagenwerte 1 bis 20;
- vier zweiphasige `ClubCommand`-Aktionen für Identität, Stadion, Finanzen und
  Anlagen mit ausschließlich exakten Vorbedingungen;
- Tauri-Protokoll und gemeinsamer Backup-/Journal-/Read-back-/Undo-Commitpfad;
- dunkles HeroUI-v3 Club Operations Center mit vier Modi;
- stale Preview-Verfall, asynchrones Sequenzgate und Snapshot-Resync;
- Datenbank- und generische Editorintegration.

Details und offene Gates stehen in
[`docs/architecture/clubs.md`](architecture/clubs.md) und
[`docs/acceptance/clubs.md`](acceptance/clubs.md).

## Wettbewerbs-Meilenstein

PR #27 ergänzt auf dieser Basis:

- rückwärtskompatible optionale Champion-ID sowie strukturierte Stufen,
  Paarungen und Tabellenstände;
- snapshotweite Stufen-/Paarungs-IDs, Referenz-, Datums-, Ergebnis- und
  Tabelleninvarianten mit Größen- und Werteobergrenzen;
- fünf zweiphasige `CompetitionCommand`-Aktionen für Profil, Stufen,
  Paarungs-Upsert/-Löschung und Tabelle;
- bidirektional atomare Namenssynchronisation zwischen stabil referenzierten
  Wettbewerben, Clubs und Titelverteidigern;
- Tauri-Protokoll und gemeinsamer Backup-/Journal-/Read-back-/Undo-Commitpfad;
- HeroUI-v3 Competition Operations Center mit Profil, Stufen, Spielplan und
  Tabelle;
- stale Preview-Verfall, asynchrones Sequenzgate und Snapshot-Resync;
- erweiterte Datenbankspalten für Champion-ID, Stufen, Paarungen und Tabelle.

Details und offene Gates stehen in
[`docs/architecture/competitions.md`](architecture/competitions.md) und
[`docs/acceptance/competitions.md`](acceptance/competitions.md).

## Letzter Prüfstand des Wettbewerbs-Produktcommits

Erfolgreich ausgeführt:

```bash
cargo fmt --all -- --check
git diff --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
npm test --workspace @bestscout/desktop
npm run build --workspace @bestscout/desktop
scripts/build-linux-packages.sh
```

Ergebnisse:

- 75 `bestscout-core`-Tests;
- 109 Rust-Tests im vollständigen Workspace;
- 59 Vitest-/DOM-Tests in 12 Dateien;
- Clippy ohne Warnung bei `-D warnings`;
- TypeScript- und Vite-Produktionsbuild grün;
- AppImage, DEB und RPM lokal gebaut und durch den Bundle-Verifikator
  akzeptiert;
- alle sechs GitHub-Actions-Jobs auf `4719698` erfolgreich.

Paket-Hashes:

- AppImage: `6ef6f45fa6bb96db4f8ceacdaf1278b1ea5051db0aaa363303f01ad674c7fde1`
- DEB: `05341352722fb95b31512eff33eaf2fa0583388873b662b1e494a43cb8a7d65b`
- RPM: `db371d2930c6a6cf6498e29a6b91fda22cf2f4d0900fa503748006134d479e1b`

## Native UI-Gates

Die verbindliche In-App-Browserliste war bei der letzten Wiederaufnahme erneut
leer (`[]`). Deshalb wurden People, Club und Wettbewerb nicht nativ
breit/schmal, vollständig per Tastatur oder mit langen/leeren/großen
Datensätzen abgenommen.

Bis diese Prüfungen real erfolgt sind:

- alle drei PRs Draft lassen;
- keinen Merge oder 1.0-Paritätsstatus behaupten;
- keine manuelle UI-Checkbox als bestanden markieren;
- nicht auf ein anderes Browser-Backend ausweichen.

Wenn die Ansicht verfügbar ist, zuerst PR #25 nativ abnehmen, freigeben und
nach grüner aktueller CI nach `main` mergen. Danach PR #26 und anschließend
PR #27 jeweils auf den aktualisierten Vorgänger bringen beziehungsweise
retargeten, native Abnahme und CI wiederholen und erst dann mergen.

## FM26- und Bridge-Status

Letzte rein lesende Diagnose in dieser Entwicklungskette:

- Steam-Build `23583635`, Profil `fm26-steam-23583635`, exakter Treffer;
- FM26 lief mit realem `fm.exe` PID `172108`, vom Nutzer selbst gestartet;
- Bridge-Version `0.4.0` weiterhin verwaltet und hashverifiziert installiert;
- Pluginpfad:
  `/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26/BepInEx/plugins/BestScout`;
- BepInEx 6 fand 0.4.0, verwarf den net8-Build aber vor `Load()` im .NET-6.0.7-
  Host mit einer `NullableContextAttribute`-TypeLoadException; deshalb existierte
  kein Descriptor und keine Bridge-Runtime;
- `reader_allowed=false`, `editor_allowed=false`.

Der korrigierte, noch nicht installierte Kandidat liegt auf
`agent/live-domain-readers`, Commit `760c945`, Draft-PR #28:
https://github.com/maxionice/bestscout/pull/28

- Bridge `0.5.0` zielt auf `net6.0` und enthält die beiden Compiler-only-
  Nullable-Attribute assembly-lokal;
- authentifizierter, single-flight Property-Sampler für exakt die acht
  katalogisierten Referenzfamilien, maximal 32 IDs, fünf Sekunden Timeout und
  Cleanup jedes geöffneten Channels;
- `domain_read=false`, `domain_write=false`, keine Snapshot-Publikation;
- Release-DLL: 86.528 Bytes, SHA-256
  `7957a581325ea63c230d2b5df7fde5cff34247526921256321435ea02609278e`;
- 113 Rust-Tests, 59 Vitest-Tests, Workspace-Clippy, TypeScript/Vite und
  reproduzierbarer net6-Bridge-Rebuild grün.

Weil FM bei Fertigstellung weiter lief, wurden installierte DLL und Manifest
bewusst nicht verändert. Nach einem normalen, vom Nutzer ausgeführten FM-Ende
darf 0.5.0 über den verwalteten Lifecycle aktualisiert werden; FM nicht selbst
beenden.

Sicherheitsregeln:

- FM niemals für den Nutzer starten oder schließen.
- Bridge niemals bei laufendem FM installieren, ändern oder entfernen.
- Keine Live-Mutation, bevor Domain-Roots, feldgenaue Adapter, Main-Thread-
  Ausführung, Read-back, Rollback und Undo auf dem exakten Build abgenommen
  sind.
- Grüne kanonische Commands schalten keine Live-Rechte frei.

## Exakte Wiederaufnahme

```bash
cd /home/maxi/Dokumente/bestscout
git switch agent/live-domain-readers
git status -sb
git diff --check
gh pr view 25 --json url,state,isDraft,mergeable,headRefOid,statusCheckRollup
gh pr view 26 --json url,state,isDraft,mergeable,baseRefName,headRefOid,statusCheckRollup
gh pr view 27 --json url,state,isDraft,mergeable,baseRefName,headRefOid,statusCheckRollup
gh pr view 28 --json url,state,isDraft,mergeable,baseRefName,headRefOid,statusCheckRollup
gh pr checks 25
gh pr checks 26
gh pr checks 27
gh pr checks 28
```

Danach die In-App-Browseransicht prüfen. Ist sie weiter nicht verfügbar, die
drei nativen Gates offen lassen und den nächsten unabhängigen Roadmap-Block
auf einem eigenen gestapelten Branch fortsetzen.

FM-Live-Arbeit erst fortsetzen, nachdem der Nutzer FM normal beendet hat. Dann
erneut Prozessfreiheit prüfen, den net6-Kandidaten bauen und ausschließlich über
den verwalteten Lifecycle installieren:

```bash
dotnet build bridge/BestScout.Bridge/BestScout.Bridge.csproj -t:Rebuild -c Release \
  -p:FM26Root="/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26"
cargo run -p bestscout-live --bin bestscout-bridge -- install \
  --game-root "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26" \
  --artifact bridge/BestScout.Bridge/bin/Release/net6.0/BestScout.Bridge.dll
```

Danach FM weiterhin nicht selbst starten. Erst nach einem vom Nutzer selbst
ausgeführten Neustart und geladenem Spielstand rein lesend einsteigen:

```bash
cargo run -p bestscout-live --bin bestscout-diagnose
cargo run -p bestscout-live --bin bestscout-reference-catalog -- \
  --game-root "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26"
```
