# BestScout-Benutzerhandbuch

Dieses Handbuch beschreibt die Linux-Desktopanwendung. BestScout ist unabhängig
von Sports Interactive und SEGA und enthält weder Football-Manager-Code noch
Spieldaten oder Bilder.

<!-- bestscout-topic:safety -->
## 1. Sicherheitsmodell

BestScout behandelt Scouting, Lesen und Schreiben als getrennte Fähigkeiten.
Weder ein gefundener FM26-Prozess noch ein passender Programm-Fingerprint
schaltet den Editor frei.

- Unbekannte und nur teilweise passende Builds bleiben read-only.
- Die Flatpak-Ausgabe sieht keine Host-Prozesse und bleibt immer offline.
- BestScout startet oder beendet Football Manager nie selbst.
- Installation, Update und Entfernung der Bridge werden verweigert, solange ein
  FM- oder Launcher-Prozess läuft.
- Live-Schreibzugriffe bleiben gesperrt, bis Feldadapter, Main-Thread-Ausführung,
  Read-back, Rollback und Undo für den exakten Build abgenommen sind.

Die Editorbereiche arbeiten mit einem kanonischen lokalen Snapshot. Eine grüne
lokale Vorschau bedeutet nicht, dass der entsprechende FM-Live-Adapter aktiv ist.

<!-- bestscout-topic:packages -->
## 2. Das richtige Paket wählen

| Paket | Einsatzzweck | FM-Live-Zugriff |
| --- | --- | --- |
| AppImage | Portable native Linux-Nutzung | Nach Adapterabnahme unterstützt |
| DEB | Debian, Ubuntu, Mint und Ableger | Nach Adapterabnahme unterstützt |
| RPM | Fedora, openSUSE und Ableger | Nach Adapterabnahme unterstützt |
| Flatpak | Abgeschottetes Offline-Scouting | Nie |
| Steam-Deck-Ausgabe | Native AppImage mit Gaming-Mode-Starter | Nach Adapterabnahme unterstützt |

Der Steam-Deck-Download enthält AppImage, Starter und getrennte deutsche und
englische Anleitungen. Starter und Deck-AppImage müssen im selben Ordner liegen.
[Linux-Paketierung und Release-Prüfung](release/linux-packaging.md) beschreibt
Build- und Signaturdetails.

<!-- bestscout-topic:first-start -->
## 3. Erster Start und Datenimport

BestScout kann ohne gestarteten FM-Prozess geöffnet werden. Der eingebaute
synthetische Datensatz macht jeden Offline-Bereich ohne reale Daten prüfbar.

Für einen FM-Export **CSV importieren** wählen und eine CSV- oder Textdatei
öffnen. BestScout versteht Komma und Semikolon sowie verbreitete deutsche und
englische Spaltennamen. Spieler-ID und Name bilden die kleinste sinnvolle
Identität; fehlende optionale Werte bleiben unbekannt und werden nicht erfunden.

Nach dem Import Spielerzahl und Warnungen im Statusbereich prüfen. Der
ursprüngliche Export sollte als unveränderte Datenquelle erhalten bleiben.

<!-- bestscout-topic:scouting -->
## 4. Suche, Scouting und Analyse

- **Übersicht** durchsucht Spieler, Staff, Vereine und Wettbewerbe gemeinsam.
- **Scout-Intel** erklärt Entwicklungschancen und bietet konfigurierbare Listen
  für Wonderkids, Schnäppchen, vertragslose und bald vertragslose Spieler.
- **Datenbank** zeigt vollständige kanonische Entitätstabellen.
- **Spielersuche** kombiniert Text-, Alters-, Vertrags-, Wert- und Rollenfilter
  mit gespeicherten Ansichten und wählbaren Spalten.
- **Kaderanalyse** zeigt Breite, Alter, Gehälter, Verträge und Nachfolgerisiken.
- **Vergleich** stellt bis zu vier Spieler in Rollenradar und Attributmatrix
  gegenüber und schlägt ähnliche Spieler vor.
- **Shortlist** speichert Favoriten, Tags und Notizen lokal und tauscht
  JSON/CSV/HTML aus.

Rollenwerte sind erklärbar und enthalten eine Abdeckungsangabe. Ein Wert mit
geringer Abdeckung ist unvollständige Evidenz und keine präzise Bewertung.

<!-- bestscout-topic:workspaces -->
## 5. Kanonische Operationsbereiche

Verfügbarkeits-, Transfer-, People-, Club- und Wettbewerbsbereich erzeugen
typisierte Befehle gegen genau einen kanonischen Snapshot. Vor der Vorschau
werden Referenzen und Domäneninvarianten vollständig geprüft.

- **Verfügbarkeit** umfasst Fitness, Kondition, Moral, Verletzungen und Sperren.
- **Transfers** umfasst sofortige, künftige, Leih- und gegenseitige Tauschrouten.
- **People** umfasst Staff-Zuweisungen, Sprachen, Qualifikationen,
  Registrierungen und Beziehungen.
- **Club-Zentrale** umfasst Identität, Wettbewerbslinks, Finanzen, Stadion,
  Einrichtungen, `#RRGGBB`-Clubfarben, vier typisierte Trikotslots und
  Clubbeziehungen.
- **Wettbewerbs-Zentrale** umfasst Profile, Titelverteidiger, Stufen, Paarungen
  und Tabellen.

Das Bearbeiten eines Formulars wendet noch nichts an. Zuerst die exakte Vorschau
prüfen.

<!-- bestscout-topic:editing -->
## 6. Lokaler Editor, Masseneditor und Freezer

Der **Editor** versieht jede Änderung mit einem exakten erwarteten Ausgangswert.
Beim Commit entstehen privates Backup und hashverketteter Journaleintrag; das
Gesamtergebnis wird validiert und per Read-back geprüft. Undo verlangt den exakt
committeten Snapshot.

Der Masseneditor wendet ein begrenztes Preset auf gefilterte Ziele an. Setzen,
Addieren, Skalieren und Begrenzen lehnen Typfehler und reine No-op-Transaktionen
als Ganzes ab.

Der **Freezer** speichert Regeln pro Feld:

- exakt korrigiert jede Abweichung;
- Plus erlauben korrigiert nur Rückgänge;
- Beobachten meldet ohne Korrektur.

Eine nicht auflösbare Entität oder ein Feld sperrt die gesamte Korrektur.
Automatische Live-Ausführung bleibt bis zur Live-Read-back-Abnahme deaktiviert.

<!-- bestscout-topic:live -->
## 7. FM26-Erkennung und In-Game-Bridge

Unter **Live-Spiel** mit **Spiel erkennen** eine rein lesende Diagnose starten.
Die Oberfläche trennt Installationsfund, exakten Fingerprint, Prozessprobe,
Bridge-Zustand, Domain-Roots, Domain-Reader und Editor-Freigabe.

Der Bridge-Status lässt sich auch im Terminal prüfen:

```bash
cargo run -p bestscout-live --bin bestscout-bridge -- status \
  --game-root "/pfad/zu/Football Manager 26"
```

Installation oder Update erst nach normalem FM-Ende ausführen. Den verwalteten
Lifecycle aus [Bridge-Lifecycle](architecture/bridge-lifecycle.md) verwenden und
Plugin-Dateien nicht von Hand kopieren. Danach FM selbst starten, den gewünschten
Spielstand laden und erneut diagnostizieren. Eine sichtbare Bridge schaltet nicht
automatisch Lesen oder Schreiben frei; maßgeblich sind die Fähigkeitskarten.

<!-- bestscout-topic:facepacks -->
## 8. Newgen-Facepacks

Der Bereich **Newgen-Faces** weist vorhandene lokale Porträts zu; er erzeugt und
lädt keine Bilder hoch.

1. Einen Ordner mit direkten PNG/JPG/JPEG-Dateien und eine vorhandene
   FM-Custom-Graphics-Zielwurzel wählen.
2. Eine kleingeschriebene Paket-ID und einen stabilen Zuordnungsschlüssel setzen.
3. Spieler mit numerischen FM-UIDs auswählen.
4. Ausdrücklich bestätigen, dass alle gewählten Spieler Newgens sind. BestScout
   leitet das nie nur aus Alter oder UID-Höhe ab.
5. Exakte Bild-zu-`r-UID`-Zuordnung und Zielordner prüfen.
6. Atomar installieren und anschließend in FM die normale
   Custom-Graphics-/Skin-Aktualisierung ausführen.

Der Quellordner bleibt unverändert, vorhandene Ziele werden nie überschrieben.
Entfernung braucht eine zweite Bestätigung und gelingt nur, wenn Manifest,
Konfiguration und jedes Bild unverändert passen. Die
[Facepack-Architektur](architecture/newgen-facepacks.md) erklärt Grenzen und
Fehlerverhalten.

<!-- bestscout-topic:data -->
## 9. Lokale Daten, Backups und Datenschutz

Editor-Backups, Journale, Freezer-Pläne, gespeicherte Ansichten und Shortlist
bleiben lokal. Facepack-Manifeste speichern generierte Dateinamen, FM-Ziel-IDs
und Hashes, aber keine Quellordner. Der Bridge-Deskriptor nutzt pro Start ein
neues Zufallstoken und bindet ausschließlich an Loopback.

Spielstandsdaten, Bridge-Deskriptoren, Tokens oder vollständige Diagnosearchive
nicht in öffentlichen Issues veröffentlichen. Sicherheitslücken gemäß
[SECURITY.md](../SECURITY.md) melden.

<!-- bestscout-topic:verification -->
## 10. Release verifizieren

Paket, `SHA256SUMS` und portables Sigstore-Provenienz-Bundle aus demselben
GitHub-Release herunterladen. In diesem Ordner ausführen:

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify BestScout_1.0.0_amd64.AppImage \
  --repo maxionice/bestscout \
  --bundle BestScout_1.0.0_provenance.sigstore.json \
  --signer-workflow github.com/maxionice/bestscout/.github/workflows/release.yml
```

Dabei das tatsächlich heruntergeladene Artefakt einsetzen. Der Workflow baut
zuerst einen Draft, prüft den vollständigen Satz, signiert und verifiziert jedes
checksummierte Artefakt unabhängig und veröffentlicht erst im letzten Schritt.

<!-- bestscout-topic:troubleshooting -->
## 11. Fehlerbehebung

**FM wird nicht gefunden:** Ein natives Paket verwenden, Steam-Installation
prüfen und den vollständigen FM-Start abwarten. Flatpak sieht den Host-Prozess
nicht.

**Build nicht unterstützt:** Die Sperre nicht umgehen. BestScout aktualisieren
oder auf ein versioniertes Profil für den exakten Steam-Build warten.

**Bridge-Installation verweigert:** FM normal schließen und warten, bis Spiel-
und Launcher-Prozesse beendet sind. Veränderte, unverwaltete oder unvollständige
Plugin-Zustände brauchen manuelle Prüfung; einen Force-Schalter gibt es nicht.

**Facepack-Vorschau schlägt fehl:** Direkte reguläre PNG/JPEG-Dateien verwenden,
doppelte Inhalte entfernen, Überlappung von Quelle und Ziel vermeiden und genug
eindeutige Bilder bereitstellen. Der Zielordner derselben Paket-ID darf noch
nicht existieren.

**Facepack-Entfernung verweigert:** Ordner erhalten. Eine unerwartete, fehlende,
symbolische oder veränderte Datei blockiert die Löschung absichtlich.

<!-- bestscout-topic:limitations -->
## 12. Aktuelle Grenzen und Supportumfang

[Roadmap](roadmap.md), [Feature-Parity-Spezifikation](feature-parity.md) und
[aktueller Handoff](handoff.md) enthalten den genauen Abnahmestand. Live-FM26-
Entitätsleser und alle Live-Schreibzugriffe bleiben bis zu ihren versionierten
Abnahmen gesperrt. Native Sichtprüfungen und Steam-Deck-Hardwaretests werden
getrennt von automatisierten Tests geführt.

BestScout unterstützt eigenen Quellcode und eigene erzeugte Artefakte. Es liefert
keine Football-Manager-Dateien, fremden Gesichtsbilder oder BepInEx-Distributionen
und hilft nicht beim Umgehen von Plattform-, Lizenz- oder Sicherheitskontrollen.
