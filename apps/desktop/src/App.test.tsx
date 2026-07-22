// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App, { LiveWorkspace } from "./App";
import type { LiveEnvironment } from "./types";

afterEach(cleanup);

describe("BestScout desktop", () => {
  it("renders the scouting workspace", () => {
    render(<App />);
    expect(screen.getByRole("banner", { name: "BestScout Fensterleiste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimieren" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Übersicht" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Spielersuche" }));
    expect(screen.getByRole("heading", { name: "Spielersuche" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Spielerliste" })).toBeTruthy();
  });

  it("shows capability gates in the live workspace", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Live-Spiel" }));
    expect(screen.getByRole("heading", { name: "Live-Spiel" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Live-Fähigkeiten" })).toBeTruthy();
    expect(screen.getAllByText("Editor").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the safe HeroUI editor without enabling live writes", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(await screen.findByRole("heading", { name: "Sichere Arbeitskopie" })).toBeTruthy();
    expect(screen.getByText("LIVE-SCHREIBEN GESPERRT")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Editor-Entitätstyp wählen" })).toBeTruthy();
  });

  it("opens the attribute freezer and change monitor workspace", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Freezer" }));
    expect(screen.getByRole("heading", { name: "Freezer" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Attribute Freezer & Change Monitor" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Baseline erfassen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Change Monitor" })).toBeTruthy();
  });

  it("opens the safe People and Registration Center", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "People & Registration Center" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "People-Bereich" })).toBeTruthy();
    expect(screen.getByText("Sichere Arbeitskopie")).toBeTruthy();
  });

  it("opens the scout intelligence workspace", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Scout-Intel" }));
    expect(screen.getByRole("heading", { name: "Scout-Intel" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Talent-Radar" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Intelligente Scoutinglisten" })).toBeTruthy();
  });

  it("shows squad depth, contracts, wages and succession risks", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Kaderanalyse" }));

    expect(screen.getByRole("heading", { name: "Kadergesundheit" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Positionsbreite" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Vertragshorizont" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Nachfolge- & Verlängerungsrisiken" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Gehaltsausreißer" })).toBeTruthy();
    expect(screen.getAllByText("Defensives Mittelfeld").length).toBeGreaterThanOrEqual(1);
  });

  it("opens global search and advanced player filters", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Globale Suche" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Gesamte Datenbank durchsuchen" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Spielersuche" }));
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(screen.getByRole("region", { name: "Erweiterte Spielerfilter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "U21-Talente" })).toBeTruthy();
  });

  it("shows complete player, staff, club and competition entity tables", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Datenbank" }));

    expect(screen.getByRole("heading", { name: "Entitätsdatenbank" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Spielerdaten" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "PROFESSIONALITÄT" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "VERTRAGSVEREIN-ID" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "VERLETZT" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "REGISTRIERUNGEN" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Staff/ }));
    expect(screen.getByRole("grid", { name: "Staffdaten" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "TAKTIKWISSEN" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "VERANTWORTUNGEN" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Vereine/ }));
    expect(screen.getByRole("grid", { name: "Vereinsdaten" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "TRANSFERBUDGET" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Wettbewerbe/ }));
    expect(screen.getByRole("grid", { name: "Wettbewerbsdaten" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "TITELVERTEIDIGER" })).toBeTruthy();
  });

  it("switches between FM26 phases and recalculates the selected role", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Spielersuche" }));

    expect(screen.getByRole("region", { name: "FM26-Rollenprofil wählen" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Rollen mit Ball" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Gegen den Ball/ }));
    expect(screen.getByRole("group", { name: "Rollen gegen den Ball" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pressing Forward/ }));
    expect(screen.getByText(/Rollenprofil: Pressing Forward/)).toBeTruthy();
  });

  it("adds custom columns and saves the complete player view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Spielersuche" }));
    fireEvent.click(screen.getByRole("button", { name: /Spalten/ }));

    expect(screen.getByRole("group", { name: "Sichtbare Tabellenspalten" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /NationBasis/ }));
    expect(screen.getByRole("columnheader", { name: "NATION" })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Name der Ansicht" }), { target: { value: "U21-Spielmacher" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByRole("button", { name: "U21-Spielmacher" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ansicht U21-Spielmacher löschen" })).toBeTruthy();
  });

  it("compares players with a role radar and attribute matrix", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Vergleich/ }));

    expect(screen.getByRole("heading", { name: "Direktvergleich" })).toBeTruthy();
    expect(screen.getByText("2/4 AUSGEWÄHLT")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Rollenprofil-Radar für/ })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Verglichene Rollenattribute" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ähnliche Spieler & Ersatzkandidaten" })).toBeTruthy();
  });

  it("persists shortlist metadata through the dedicated workspace", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Shortlist1" }));

    expect(screen.getByRole("heading", { name: "Scouting-Board" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Tag für Elias Berg" }), { target: { value: "Winterfenster" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag für Elias Berg hinzufügen" }));
    expect(screen.getByRole("button", { name: "Tag Winterfenster bei Elias Berg entfernen" })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Notiz für Elias Berg" }), { target: { value: "Noch einmal beobachten" } });
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Notiz für Elias Berg" }).value).toBe("Noch einmal beobachten");
  });

  it("adds a player from search to the shortlist", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Spielersuche" }));
    fireEvent.click(screen.getByRole("button", { name: "Shortlist für Noah Hartmann umschalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Shortlist2" }));
    expect(screen.getByRole("heading", { name: "Noah Hartmann" })).toBeTruthy();
  });

  it("removes and adds comparison players interactively", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Vergleich/ }));

    fireEvent.click(screen.getByRole("button", { name: /Elias Berg aus Vergleich entfernen/ }));
    expect(screen.getByText("Noch einen Spieler auswählen")).toBeTruthy();
    expect(screen.queryByRole("grid", { name: "Verglichene Rollenattribute" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen: Elias Berg" }));
    expect(screen.getByText("2/4 AUSGEWÄHLT")).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Verglichene Rollenattribute" })).toBeTruthy();
  });

  it("shows the verified read-only probe for the real game process", () => {
    const environment = {
      runtime_sandbox: "none",
      installations: [{
        root: "/games/fm26", executable: "/games/fm26/fm.exe", game_assembly: "/games/fm26/GameAssembly.dll",
        global_metadata: "/games/fm26/global-metadata.dat", steam_build_id: "23583635",
        build_fingerprint: {
          executable: { sha256: "a".repeat(64), size: 1 }, game_assembly: { sha256: "b".repeat(64), size: 2 },
          global_metadata: { sha256: "c".repeat(64), size: 3 },
        },
        compatibility: {
          status: "exact", profile_id: "fm26-steam-23583635", label: "FM26 Steam build 23583635",
          capabilities: { process_inspection: true, domain_read: false, domain_write: false }, reason: "match",
        },
      }],
      processes: [{ pid: 77, command: "fm.exe" }],
      bridge: {
        health: { bridge_version: "0.4.0", pid: 77, read_only: true },
        capabilities: { health: true, domain_read: false, domain_write: false },
        domain_roots: {
          schema_version: 1, checked_at_utc: "2026-07-22T02:00:00Z", state: "roots_resolved",
          initialiser_count: 1, initialisation_complete: true, context_module_count: 1,
          interop_subsystem_count: 1, database_factory_available: true,
          reference_metadata: {
            game_properties: 1, person_properties: 1, club_properties: 1,
            competition_properties: 1, person_search_properties: 1,
            person_summary_properties: 1, club_summary_properties: 1,
            competition_summary_properties: 1,
          },
          error: null,
        },
      },
      bridge_deployment: {
        state: "managed", plugin_directory: "/game/BepInEx/plugins/BestScout",
        bridge_path: "/game/BepInEx/plugins/BestScout/BestScout.Bridge.dll",
        manifest_path: "/game/BepInEx/plugins/BestScout/bestscout-install.json",
        manifest: {
          schema_version: 1, bridge_version: "0.4.0", profile_id: "fm26-steam-23583635",
          bridge_filename: "BestScout.Bridge.dll", sha256: "a".repeat(64), size: 1024,
          installed_at_unix_seconds: 1,
        },
        observed_artifact: { sha256: "a".repeat(64), size: 1024 },
        reason: "managed bridge integrity is verified",
      },
      process_access: {
        inspection: { pid: 77, region_count: 100, readable_region_count: 90, fm_executable_base: 0x140000000, game_assembly_base: 0x6ffff0000000 },
        executable_signature_valid: true,
      },
      process_access_error: null, process_inspection_allowed: true, reader_allowed: false, editor_allowed: false,
      message: "FM26 is running with verified read-only process access",
    } satisfies LiveEnvironment;

    render(<LiveWorkspace environment={environment} isDetecting={false} onDetect={() => undefined} />);
    expect(screen.getByText("PID 77 · MZ-Signatur bestätigt")).toBeTruthy();
    expect(screen.getByText("1 Interop-Root · Referenzen verifiziert")).toBeTruthy();
    expect(screen.getByText("0x140000000")).toBeTruthy();
    expect(screen.getByTitle("PID 77 · 90/100 Bereiche lesbar")).toBeTruthy();

    cleanup();
    render(<LiveWorkspace environment={{ ...environment, processes: [], bridge: null, process_access: null }} isDetecting={false} onDetect={() => undefined} />);
    expect(screen.getByText("Bridge 0.4.0 installiert · FM26 starten")).toBeTruthy();

    cleanup();
    render(<LiveWorkspace environment={{ ...environment, runtime_sandbox: "flatpak", processes: [], bridge: null, process_access: null, process_inspection_allowed: false }} isDetecting={false} onDetect={() => undefined} />);
    expect(screen.getByText("Host-Prozesse sind in Flatpak nicht sichtbar")).toBeTruthy();
    expect(screen.getByText("AppImage, DEB oder RPM für Live-Zugriff verwenden")).toBeTruthy();
  });
});
