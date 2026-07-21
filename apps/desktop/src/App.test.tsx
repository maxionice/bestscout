// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("BestScout desktop", () => {
  it("renders the scouting workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Spielersuche" })).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Spielerliste" })).toBeTruthy();
  });
});
