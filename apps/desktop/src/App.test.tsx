// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";

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
    expect(screen.getByText("Editor")).toBeTruthy();
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
});
