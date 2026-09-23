import { describe, expect, it } from "vitest";
import { dataset, exampleDecisions } from "@/data/dataset";
import { createSimulationEngine, simulationEngine } from "@/domain";
import type { Dataset, Decision, Scenario } from "@/domain/types";

const organizerScenario: Scenario = { decisions: exampleDecisions };
const cheapScenario: Scenario = {
  decisions: [
    { measureId: "M9", districtId: "nura" },
    { measureId: "M11", districtId: "esil" },
    { measureId: "M10", districtId: "baikonur" },
    { measureId: "M12" },
    { measureId: "M4", districtId: "almaty" },
  ],
};

function resultOf(scenario: Scenario) {
  const evaluation = simulationEngine.evaluate(scenario);
  if (!evaluation.ok) throw new Error(evaluation.issues.map(({ message }) => message).join("; "));
  return evaluation.result;
}

function withMeasureEffects(measureId: string, effects: Record<string, number>): Dataset {
  return {
    ...dataset,
    measures: dataset.measures.map((measure) => measure.id === measureId
      ? { ...measure, effects: { ...measure.effects, ...effects } }
      : measure),
  };
}

describe("deterministic city simulation engine", () => {
  it("calculates the organizer baseline from the supplied weights", () => {
    const baseline = simulationEngine.baseline();
    expect(baseline.score).toBeCloseTo(52.55768, 5);
    expect(baseline.populationWeightedAverage).toBeCloseTo(56.8624, 4);
    expect(baseline.criticalIndicators).toHaveLength(2);
    expect(baseline.criticalIndicators.map(({ indicatorId }) => indicatorId)).toEqual(["S1", "S2"]);
  });

  it("evaluates the organizer example and reports its complete result", () => {
    const result = resultOf(organizerScenario);
    expect(result.valid).toBe(true);
    expect(result.validationErrors).toEqual([]);
    expect(result.totalCost).toBe(95);
    expect(result.remainingBudget).toBe(5);
    expect(result.baselineScore).toBeCloseTo(52.55768, 5);
    expect(result.finalScore).toBeCloseTo(56.54307, 5);
    expect(result.scoreDelta).toBeCloseTo(3.98539, 5);
    expect(result.indicatorsBefore).toHaveLength(5);
    expect(result.indicatorsAfter).toHaveLength(5);
    expect(result.decisionContributions).toHaveLength(5);
    expect(result.synergies).toEqual([
      { pair: ["M10", "M12"], districtId: "nura", effects: { B1: 2 } },
    ]);
  });

  it("applies every synergy at full strength after lag-scaled measure effects", () => {
    const busLanesAndSignals: Scenario = { decisions: [
      { measureId: "M1", districtId: "esil" },
      { measureId: "M2" },
      { measureId: "M4", districtId: "nura" },
      { measureId: "M7", districtId: "esil" },
      { measureId: "M12" },
    ] };
    const first = resultOf(busLanesAndSignals);
    expect(first.synergies).toContainEqual({
      pair: ["M1", "M2"], districtId: "esil", effects: { T1: 2 },
    });
    expect(first.after.districts.find(({ districtId }) => districtId === "esil")!.indicators.T1).toBe(54.5);

    const cleanFuelAndGreenBelt: Scenario = { decisions: [
      { measureId: "M5", districtId: "saryarka" },
      { measureId: "M6" },
      { measureId: "M7", districtId: "esil" },
      { measureId: "M10", districtId: "nura" },
      { measureId: "M12" },
    ] };
    const second = resultOf(cleanFuelAndGreenBelt);
    expect(second.synergies).toContainEqual({
      pair: ["M5", "M6"], districtId: "saryarka", effects: { E2: 2 },
    });
    expect(second.after.districts.find(({ districtId }) => districtId === "saryarka")!.indicators.E2).toBe(52.25);
  });

  it("accepts the cheapest dataset example at a total cost of 61", () => {
    const validation = simulationEngine.validate(cheapScenario);
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.budget.spent).toBe(61);
      expect(validation.budget.remaining).toBe(39);
    }
  });

  it("accepts the full budget and rejects a scenario costing 101", () => {
    const exactly100: Scenario = { decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M7", districtId: "esil" },
      { measureId: "M2" },
      { measureId: "M12" },
      { measureId: "M9", districtId: "almaty" },
    ] };
    const exactly101: Scenario = { decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M7", districtId: "esil" },
      { measureId: "M2" },
      { measureId: "M4", districtId: "saryarka" },
      { measureId: "M9", districtId: "almaty" },
    ] };

    expect(simulationEngine.validate(exactly100)).toMatchObject({ valid: true, budget: { spent: 100, remaining: 0 } });
    expect(simulationEngine.validate(exactly101)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "BUDGET_EXCEEDED" })]),
    });
  });

  it("rejects a scenario over the fixed budget", () => {
    const scenario: Scenario = { decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M4", districtId: "almaty" },
      { measureId: "M7", districtId: "nura" },
      { measureId: "M8", districtId: "esil" },
      { measureId: "M13", districtId: "baikonur" },
    ] };
    const evaluation = simulationEngine.evaluate(scenario);
    expect(evaluation.ok).toBe(false);
    if (!evaluation.ok) expect(evaluation.issues.map(({ code }) => code)).toContain("BUDGET_EXCEEDED");
  });

  it("requires exactly five decisions", () => {
    expect(simulationEngine.validate({ decisions: exampleDecisions.slice(0, 4) })).toMatchObject({
      valid: false,
      issues: [{ code: "DECISION_COUNT" }],
    });
    expect(simulationEngine.validate({ decisions: [...exampleDecisions, { measureId: "M9", districtId: "esil" }] }))
      .toMatchObject({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: "DECISION_COUNT" })]),
      });
  });

  it("rejects repeated measures", () => {
    const scenario: Scenario = { decisions: [
      { measureId: "M10", districtId: "nura" },
      { measureId: "M10", districtId: "esil" },
      { measureId: "M11", districtId: "almaty" },
      { measureId: "M12" },
      { measureId: "M4", districtId: "baikonur" },
    ] };
    expect(simulationEngine.validate(scenario)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE_MEASURE" })]),
    });
  });

  it("rejects each organizer incompatibility", () => {
    const conflictingScenarios: Scenario[] = [
      { decisions: [
        { measureId: "M1", districtId: "esil" },
        { measureId: "M3", districtId: "nura" },
        { measureId: "M9", districtId: "almaty" },
        { measureId: "M10", districtId: "baikonur" },
        { measureId: "M12" },
      ] },
      { decisions: [
        { measureId: "M4", districtId: "nura" },
        { measureId: "M7", districtId: "nura" },
        { measureId: "M10", districtId: "esil" },
        { measureId: "M11", districtId: "almaty" },
        { measureId: "M12" },
      ] },
      { decisions: [
        { measureId: "M5", districtId: "nura" },
        { measureId: "M13", districtId: "nura" },
        { measureId: "M9", districtId: "esil" },
        { measureId: "M10", districtId: "almaty" },
        { measureId: "M12" },
      ] },
    ];
    for (const scenario of conflictingScenarios) {
      const validation = simulationEngine.validate(scenario);
      expect(validation.valid).toBe(false);
      if (!validation.valid) expect(validation.issues.map(({ code }) => code)).toContain("INCOMPATIBLE_MEASURES");
    }
  });

  it("requires district IDs only for district measures and rejects unknown districts", () => {
    const missingDistrict = simulationEngine.validate({ decisions: [
      { measureId: "M7" },
      ...exampleDecisions.slice(1),
    ] });
    expect(missingDistrict).toMatchObject({ valid: false, issues: [{ code: "DISTRICT_REQUIRED" }] });

    const unknownDistrict = simulationEngine.validate({ decisions: [
      { measureId: "M7", districtId: "unknown" },
      ...exampleDecisions.slice(1),
    ] });
    expect(unknownDistrict).toMatchObject({ valid: false, issues: [{ code: "UNKNOWN_DISTRICT" }] });

    const cityWithDistrict = simulationEngine.validate({ decisions: [
      ...exampleDecisions.slice(0, 3),
      { measureId: "M12", districtId: "nura" },
      exampleDecisions[4],
    ] });
    expect(cityWithDistrict).toMatchObject({ valid: false, issues: [{ code: "DISTRICT_FORBIDDEN" }] });
  });

  it("limits each direction to at most two measures", () => {
    const scenario: Scenario = { decisions: [
      { measureId: "M1", districtId: "nura" },
      { measureId: "M2" },
      { measureId: "M3", districtId: "esil" },
      { measureId: "M9", districtId: "almaty" },
      { measureId: "M12" },
    ] };
    expect(simulationEngine.validate(scenario)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "DIRECTION_LIMIT" })]),
    });
  });

  it("clips indicator values at both ends of the 0–100 range", () => {
    const highEngine = createSimulationEngine(withMeasureEffects("M3", { T1: 1_000 }));
    const highScenario: Scenario = { decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M7", districtId: "esil" },
      { measureId: "M10", districtId: "almaty" },
      { measureId: "M12" },
      { measureId: "M4", districtId: "saryarka" },
    ] };
    const high = highEngine.evaluate(highScenario);
    expect(high.ok).toBe(true);
    if (high.ok) expect(high.result.after.districts.find(({ districtId }) => districtId === "nura")!.indicators.T1).toBe(100);

    const lowEngine = createSimulationEngine(withMeasureEffects("M11", { T1: -1_000 }));
    const lowScenario: Scenario = { decisions: [
      { measureId: "M11", districtId: "nura" },
      { measureId: "M9", districtId: "esil" },
      { measureId: "M10", districtId: "almaty" },
      { measureId: "M12" },
      { measureId: "M4", districtId: "saryarka" },
    ] };
    const low = lowEngine.evaluate(lowScenario);
    expect(low.ok).toBe(true);
    if (low.ok) expect(low.result.after.districts.find(({ districtId }) => districtId === "nura")!.indicators.T1).toBe(0);
  });

  it("applies M11's negative transport effect with the specified lag fraction", () => {
    const result = resultOf(cheapScenario);
    const esil = result.after.districts.find(({ districtId }) => districtId === "esil")!;
    expect(esil.indicators.T1).toBe(43.25);
    expect(result.decisionContributions.find(({ measureId }) => measureId === "M11")?.realizedEffects.T1)
      .toBe(-1.75);
  });

  it("changes the score when the selected decisions change", () => {
    const first = resultOf(organizerScenario);
    const alternative: Scenario = { decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M6" },
      { measureId: "M8", districtId: "saryarka" },
      { measureId: "M10", districtId: "nura" },
      { measureId: "M12" },
    ] };
    expect(resultOf(alternative).finalScore).not.toBe(first.finalScore);
  });

  it("produces identical scores and normalized details regardless of decision order", () => {
    const forward = resultOf(organizerScenario);
    const reversed = resultOf({ decisions: [...organizerScenario.decisions].reverse() as Decision[] });
    expect(reversed.finalScore).toBe(forward.finalScore);
    expect(reversed.scoreDelta).toBe(forward.scoreDelta);
    expect(reversed.scenario).toEqual(forward.scenario);
    expect(reversed.decisionContributions).toEqual(forward.decisionContributions);
  });

  it("does not mutate the organizer dataset while validating or evaluating", () => {
    const before = JSON.stringify(dataset);
    simulationEngine.validate(organizerScenario);
    simulationEngine.evaluate(organizerScenario);
    expect(JSON.stringify(dataset)).toBe(before);
  });
});
