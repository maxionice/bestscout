import { describe, expect, it } from "vitest";

import { demoPlayers } from "./demo";
import { analyseSquadLocally, squadAnalysisDate } from "./squad";

describe("local squad analysis fallback", () => {
  it("classifies every player into age, contract and position buckets", () => {
    const analysis = analyseSquadLocally(demoPlayers, squadAnalysisDate);

    expect(analysis.player_count).toBe(demoPlayers.length);
    expect(analysis.age_bands.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(demoPlayers.length);
    expect(analysis.contract_windows.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(demoPlayers.length);
    expect(analysis.position_groups.reduce((sum, group) => sum + group.count, 0)).toBe(demoPlayers.length);
    expect(analysis.expiring_within_year).toBe(2);
    expect(analysis.weekly_wage_total).toBeGreaterThan(0);
  });

  it("reports thin positions and high earners deterministically", () => {
    const analysis = analyseSquadLocally(demoPlayers, squadAnalysisDate);

    expect(analysis.succession_risks.some((risk) => risk.position_group_id === "defensive_midfield" && risk.severity === "critical")).toBe(true);
    expect(analysis.wage_outliers[0]?.player_name).toBe("Miro Petrovic");
    expect(analysis.wage_outliers.every((outlier) => outlier.multiple_of_average >= 1.35)).toBe(true);
  });
});
