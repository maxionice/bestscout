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
- People-PR: wird nach der lokalen Abschlussprüfung veröffentlicht

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

- Branch bewusst committen und als öffentlichen Draft-PR veröffentlichen;
- GitHub-Actions vollständig grün abwarten;
- native breite/schmale Tauri-Sicht, Tastatur, Fokus und lange/leere Listen
  prüfen, sobald eine geeignete Ansicht verfügbar ist;
- erst nach diesen Gates als gemergten kanonischen Meilenstein behandeln;
- Live-People-Feldadapter bleiben ein separater Roadmap-Punkt.

## Exakte Wiederaufnahme

```bash
cd /home/maxi/Dokumente/bestscout
git switch agent/staff-registrations-relationships
git status -sb
git diff --check
```

Wenn noch kein PR existiert, die Abschlussmatrix wiederholen und anschließend
bewusst committen/pushen. Wenn ein PR existiert, zuerst dessen Checks und
Reviewzustand prüfen. Nach Merge `main` aktualisieren und diesen Handoff auf den
neuen stabilen Commit setzen.

FM-Live-Arbeit nur nach einem vom Nutzer selbst ausgeführten Neustart und
geladenem Spielstand rein lesend mit folgendem Einstieg fortsetzen:

```bash
cargo run -p bestscout-live --bin bestscout-diagnose
```

## Kurzer Resume-Prompt

> Lies `docs/handoff.md` und `docs/acceptance/people.md` vollständig. Prüfe den
> Branch `agent/staff-registrations-relationships`, den öffentlichen PR und die
> letzten Checks. Verwirf keine lokalen Änderungen. FM darf nicht von dir
> gestartet, geschlossen oder live verändert werden.
