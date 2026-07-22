# Current development handoff

Stand: 2026-07-22, Europe/Berlin

Dieses Dokument ist der verbindliche Einstiegspunkt für die nächste
Arbeitssitzung. Es trennt den stabilen öffentlichen Stand, den aktuellen
People-Meilenstein und die weiterhin gesperrte FM26-Live-Grenze.

## Repository

- Lokaler Pfad: `/home/maxi/Dokumente/bestscout`
- Öffentliches Repository: `https://github.com/maxionice/bestscout`
- Stabiler `main`: `cb2191b225145098e285d733ebab57d0dca1423e`
- Letzter gemergter Meilenstein: PR #24, vollständiges Transfer Center
- Aktueller Branch: `agent/staff-registrations-relationships`
- Aktueller Produktcommit: `898bbf7096a40014deeb02f4ba255939a1452525`
- Öffentlicher People-Draft-PR: `https://github.com/maxionice/bestscout/pull/25`
- PR-Zustand beim letzten Abruf: offen, Draft und mergebar; alle sechs
  GitHub-CI-Jobs auf `beba87c` sind grün

Die historische WIP-Aufnahme und ihr Abschlussbefund stehen in
[`docs/worklog/2026-07-22-people-wip.md`](worklog/2026-07-22-people-wip.md).
Facharchitektur und Gates stehen in
[`docs/architecture/people.md`](architecture/people.md) und
[`docs/acceptance/people.md`](acceptance/people.md).

## Aktueller Meilenstein

Der Branch implementiert den kanonischen People-, Staff- und
Registrierungsblock:

- Sprachkenntnisse für Spieler und Staff mit Sprechen, Lesen und Schreiben;
- typisierte Beziehungen zu Spielern, Staff und Vereinen;
- Spielerregistrierungen je Wettbewerb mit Status, Zeitraum, optionaler
  Rückennummer und Homegrown-Merkmalen;
- Staff-Rollen, Verantwortungen, Verein, Vertrag, Geburtsdatum und Notiz;
- datierte, typisierte Staff-Qualifikationen;
- snapshotweite IDs, Referenzprüfung, Werte-/Datumsgrenzen und Serde-Defaults;
- zweiphasige `PeopleCommand`-Aktionen mit exaktem `expected_before`;
- Tauri-/TypeScript-Protokoll und generische Editorfelder;
- Datenbankspalten mit aufgelösten Beziehungs- und Wettbewerbsnamen;
- dunkles HeroUI-v3 People & Registration Center in der eigenen rahmenlosen
  Linux-Shell;
- vier UI-Modi: Staff/Aufgaben, Registrierungen, Sprachen und Beziehungen;
- injizierbare ID-/Zeitquelle für deterministische Tests;
- Verwerfen veralteter synchroner und asynchroner Vorschauen;
- Neu-Synchronisation der Formulare nach Commit/Snapshotwechsel;
- keine erfundenen Host-Daten bei fehlendem In-Game-Spieltag;
- atomare Löschung veralteter Registrierungen bei vollzogenem Wechsel oder
  Tausch.

Commit bleibt über den gemeinsamen Editorpfad an privates Backup, Hash-Journal,
vollständige Snapshot-Validierung und exaktes Undo gebunden.

## Letzter Prüfstand

Nach dem letzten Produktcodewechsel wurden erfolgreich ausgeführt:

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

- 63 `bestscout-core`-Tests;
- 97 Rust-Tests im vollständigen Workspace;
- 49 Vitest-/DOM-Tests in 10 Dateien;
- Clippy ohne Warnung bei `-D warnings`;
- TypeScript- und Vite-Produktionsbuild grün;
- AppImage, DEB und RPM durch den Bundle-Verifikator akzeptiert.
- GitHub Actions auf dem veröffentlichten Head `beba87c`: zweimal Frontend,
  zweimal Rust und zweimal Linux-Bundles erfolgreich.

Paket-Hashes:

- AppImage: `26de04c9e4a8b9d11e7c22da8db791dd3e0f0c915eb031eb2daf4cc9aefe5074`
- DEB: `317641ae2ab19e581e493387228e85678bd1884e8d455a2c39abc836feedde29`
- RPM: `5ccb06faa35b0e54956a9137a54ecaf1796eaafe4b9b170da9174aa29b94f44b`

Die native breite/schmale Sicht- und Tastaturprüfung bleibt offen. Die
verbindliche In-App-Browserliste war erneut leer (`[]`); es wurde nicht auf ein
anderes Browser-Backend ausgewichen.

## FM26- und Bridge-Status

Letzte rein lesende Diagnose in dieser Entwicklungskette:

- Steam-Build `23583635`, Profil `fm26-steam-23583635`, exakter Treffer;
- Bridge-Version `0.4.0` verwaltet und hashverifiziert installiert;
- Pluginpfad:
  `/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26/BepInEx/plugins/BestScout`;
- DLL SHA-256:
  `6e00672924f73f76c7450764e7eb875c43a3e6ac315710790404503a30cb8c5d`;
- bei der letzten Diagnose kein FM26-Prozess und keine Bridge-Runtime;
- `reader_allowed=false`, `editor_allowed=false`.

Sicherheitsregeln:

- FM niemals für den Nutzer starten oder schließen.
- Bridge niemals bei laufendem FM installieren, ändern oder entfernen.
- Keine Live-Mutation, bevor Domain-Roots, feldgenaue Adapter, Main-Thread-
  Ausführung, Read-back und Undo auf dem exakten Build abgenommen sind.
- Der grüne kanonische People-Block schaltet keine Live-Rechte frei.

## Offene Gates dieses Meilensteins

- native breite/schmale Tauri-Sicht, Tastatur, Fokus und lange/leere Listen
  prüfen, sobald eine geeignete Ansicht verfügbar ist;
- erst nach diesen Gates als gemergten kanonischen Meilenstein behandeln;
- Live-People-Feldadapter bleiben ein separater Roadmap-Punkt.

Beim letzten Abruf am 2026-07-22 waren alle sechs Checks auf dem veröffentlichten
Head `beba87c` erfolgreich. PR #25 hatte keine Kommentare, Reviews oder offenen
Review-Threads. Die verbindliche In-App-Browserliste war bei der Wiederaufnahme
erneut leer (`[]`); deshalb sind weder die native UI-Abnahme noch die Freigabe
des Drafts oder der Merge erfolgt. Vor Merge immer den neuesten Commit und
sämtliche Checks des PR erneut prüfen.

## Exakte Wiederaufnahme

```bash
cd /home/maxi/Dokumente/bestscout
git switch agent/staff-registrations-relationships
git status -sb
git diff --check
gh pr view 25 --json url,state,isDraft,mergeable,statusCheckRollup
gh pr checks 25
```

Zuerst prüfen, ob der neueste Dokumentationscommit auf dem Remote-Branch liegt.
Danach Checks und Reviewzustand von PR #25 erneut prüfen. Nur bei vollständig
grüner CI und nach der noch offenen nativen UI-Abnahme den Draft freigeben und
mergen. Nach dem Merge `main` aktualisieren und diesen Handoff auf den neuen
stabilen Commit setzen.

FM-Live-Arbeit nur nach einem vom Nutzer selbst ausgeführten Neustart und
geladenem Spielstand rein lesend mit folgendem Einstieg fortsetzen:

```bash
cargo run -p bestscout-live --bin bestscout-diagnose
```

## Kurzer Resume-Prompt

> Lies `docs/handoff.md` und `docs/acceptance/people.md` vollständig. Prüfe den
> Branch `agent/staff-registrations-relationships`, PR #25 und die Checks des
> neuesten Commits. Verwirf keine lokalen Änderungen. Lass die native UI-
> Abnahme, den Draft-Status und den Merge offen, bis ihre Gates wirklich erfüllt
> sind. FM darf nicht von dir gestartet, geschlossen oder live verändert
> werden.
