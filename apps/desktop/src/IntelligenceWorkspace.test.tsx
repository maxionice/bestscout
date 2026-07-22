// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntelligenceWorkspace, type IntelligenceGateway } from "./IntelligenceWorkspace";
import { demoPlayers } from "./demo";
import type { DatabaseSnapshot, IntelligenceCriteria, PlayerIntelligence, ScoutIntelligenceReport } from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1, source: "synthetic", players: demoPlayers, staff: [], clubs: [], competitions: [],
};

describe("scout intelligence workspace", () => {
  it("switches smart lists and explains a development projection", async () => {
    const analyse = vi.fn(async (_snapshot: DatabaseSnapshot, criteria: IntelligenceCriteria) => report(criteria));
    const gateway: IntelligenceGateway = { analyse };
    render(<IntelligenceWorkspace players={demoPlayers} snapshot={snapshot} gateway={gateway} />);

    expect(await screen.findByRole("heading", { name: "Talent-Radar" })).toBeTruthy();
    await waitFor(() => expect(analyse).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("region", { name: "Intelligente Scoutinglisten" })).toBeTruthy();
    expect(screen.getAllByText("Noah Hartmann").length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("PA-Chance")).toBeTruthy();
    expect(screen.getByText("Einflussfaktoren")).toBeTruthy();
    expect(screen.getByText("Projizierte Attributspitzen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Schnäppchen/ }));
    await waitFor(() => expect(screen.getAllByText("Mateo Silva").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText("WERT-INDEX")).toHaveLength(2);
  });

  it("recalculates when the wonderkid threshold changes", async () => {
    const analyse = vi.fn(async (_snapshot: DatabaseSnapshot, criteria: IntelligenceCriteria) => report(criteria));
    render(<IntelligenceWorkspace players={demoPlayers} snapshot={snapshot} gateway={{ analyse }} />);
    await waitFor(() => expect(analyse).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Mindestpotenzial erhöhen" }));
    await waitFor(() => expect(analyse).toHaveBeenCalledTimes(2));
    expect(analyse.mock.calls.at(-1)?.[1].wonderkid_min_potential).toBe(151);
  });
});

function report(criteria: IntelligenceCriteria): ScoutIntelligenceReport {
  return {
    criteria,
    players: [row(0, true, true), row(1, false, true)],
    wonderkid_count: 1,
    bargain_count: 2,
    free_agent_count: 0,
    expiring_contract_count: 1,
  };
}

function row(index: number, wonderkid: boolean, bargain: boolean): PlayerIntelligence {
  const player = demoPlayers[index];
  return {
    player,
    projection: {
      projected_peak_ability: index === 0 ? 163 : 154,
      reach_potential_probability: 76,
      confidence: 75,
      ability_gain: 35,
      years_to_peak: 5,
      attribute_peaks: { passing: 19, vision: 20 },
      factors: [{
        id: "age_runway", label: "Entwicklungsfenster", score: 95, weight: 40,
        observed: true, explanation: "Alter 19; jüngere Spieler besitzen mehr Entwicklungszeit",
      }],
    },
    is_wonderkid: wonderkid,
    is_bargain: bargain,
    is_free_agent: false,
    is_expiring_contract: index === 1,
    bargain_score: index === 0 ? 13.0 : 8.6,
    contract_days_remaining: index === 1 ? 300 : null,
    discovery_score: index === 0 ? 120 : 100,
  };
}
