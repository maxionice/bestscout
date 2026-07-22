# Club identity, branding, relationships and operations architecture

Status: kanonische Operationsbasis aus `agent/club-finance-facilities`, auf
`agent/club-branding-relationships` um Farben, Kits und Clubbeziehungen
erweitert; native Sichtprüfung und Live-FM26-Adapter offen.

BestScout behandelt Vereinsidentität, Wettbewerb, Stadion, Finanzen, Anlagen,
Farben, Trikots und Clubbeziehungen als kanonische Snapshot-Daten. Die
Club-Zentrale besitzt keinen direkten
Schreibpfad. Jede Aktion erzeugt eine normale, exakte `EditTransaction` und
läuft dadurch über denselben Backup-, Journal-, Read-back- und Undo-Pfad wie
der generische Editor.

## Modell und Referenzen

Ein Club besitzt weiterhin den lesbaren Wettbewerbsnamen für ältere Snapshots
und Suchansichten. Das optionale `competition_id` ergänzt eine stabile Referenz
auf einen Eintrag des kanonischen Wettbewerbskatalogs. Fehlt die ID in einem
älteren Payload, wird sie neutral als `None` gelesen. Ist sie vorhanden, müssen
ID und Anzeigename auf denselben Wettbewerb zeigen.

Finanzen unterscheiden Kontostand, Transferbudget, Gehaltsbudget und Schulden.
Der Kontostand darf negativ sein, muss aber endlich bleiben. Budgets und
Schulden sind endlich und nicht negativ. Anlagenwerte für Training, Jugend,
Jugendrekrutierung und Juniorentraining liegen jeweils zwischen 1 und 20.

Stadionkapazität und Zuschauerschnitt sind begrenzt. Ein vorhandener
Zuschauerschnitt darf weder die Kapazität noch die technische Obergrenze
überschreiten. Namen, Kurzname, Nation, Stadion und Profistatus besitzen
explizite Längen- beziehungsweise Werteschranken.

Die rückwärtskompatible `branding`-Struktur enthält optionale Primär- und
Sekundärfarbe sowie höchstens je ein Heim-, Auswärts-, Dritt- und Torwarttrikot.
Jede Farbe nutzt exakt `#RRGGBB`; Kit-IDs und Kit-Arten sind pro Club eindeutig,
Mustertexte begrenzt. Clubbeziehungen sind typisiert als Rivale, Partner,
Mutterverein, Farmteam oder befreundeter Club. Zielclub und ID müssen existieren
beziehungsweise snapshotweit eindeutig sein; Selbstbezug, doppelte
Art-/Zielpaare und Stärken außerhalb 1 bis 100 werden abgelehnt.

## Aktionsprotokoll

`ClubCommand` trennt sieben atomare Anwendungsfälle:

- Identität, stabile Wettbewerbsreferenz, Reputation und Profistatus;
- Stadionname, Kapazität und Zuschauerschnitt;
- vollständiger Finanzrahmen;
- vollständige Anlagenqualität;
- Clubfarben und die vollständige typisierte Kitliste;
- Clubbeziehung anlegen oder aktualisieren;
- vorhandene Clubbeziehung entfernen.

`prepare_club_action` validiert zuerst den gesamten Ausgangssnapshot, liest
jeden betroffenen Wert und erzeugt nur tatsächliche Änderungen mit
`FieldExpectation::Exact`. Anschließend wird die komplette Transaktion auf
einer Arbeitskopie angewendet und erneut als ganzer Snapshot validiert. Eine
fehlende Entität, unbekannte Wettbewerbs-ID, ungültige Zahl, No-op oder stale
Vorschau erzeugt keine partielle Mutation.

Die Tauri-Grenze berechnet ausschließlich die Vorschau. Ein Commit verwendet
weiterhin `apply_snapshot_transaction` und damit private Vorher-/Nachher-
Backups, Hash-Journal, Read-back und exaktes Undo.

## Oberfläche

Das `Club Operations Center` besteht aus sechs Modi: Identität, Stadion,
Finanzen, Anlagen, Farben & Trikots und Clubbeziehungen. Auswahl, Formular und
Transaktionsvorschau sind sichtbar getrennt. Jede Formänderung verwirft eine
vorhandene Vorschau; eine verspätete
asynchrone Antwort wird nach Formular- oder Snapshotwechsel ignoriert. Nach
Commit synchronisiert sich der Entwurf aus dem übernommenen Snapshot.

## Live-Grenze

Der kanonische Command schaltet keine FM26-Schreibrechte frei. Für jeden Club-,
Branding-, Kit- und Beziehungsfeldpfad bleiben bestätigte Domain-Roots,
typisierte Lese- und Main-Thread-
Schreibzuordnung, unmittelbarer Read-back, Rollback und exaktes Undo auf dem
unterstützten Build erforderlich. Bis dahin bleibt `editor_allowed=false`.
