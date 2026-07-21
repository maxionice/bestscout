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
});
