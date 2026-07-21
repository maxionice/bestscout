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
});
