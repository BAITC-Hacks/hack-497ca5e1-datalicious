import { expect, it } from "vitest";
import { simulationEngine } from "@/domain";
import { exampleDecisions } from "@/data/dataset";
import { baselineSnapshot } from "./baseline";
import { draftIssues, readSavedDraft, selectionAdapter, selectionCost } from "./selection-adapter";

it("uses the actual engine and its baseline, not a second calculation", () => {
  expect(selectionAdapter).toBe(simulationEngine);
  expect(baselineSnapshot).toEqual(simulationEngine.baseline());
  expect(baselineSnapshot.score).toBeCloseTo(52.55768, 5);
  expect(selectionCost(exampleDecisions)).toBe(95);
});

it("allows only missing-count issues in partial saved drafts", () => {
  expect(readSavedDraft({ decisions: [{ measureId: "M7", districtId: "nura" }] })).toEqual({ decisions: [{ measureId: "M7", districtId: "nura" }] });
  expect(draftIssues({ decisions: [] })).toEqual([]);
  expect(readSavedDraft({ decisions: [] })).toEqual({ decisions: [] });
  expect(readSavedDraft({ decisions: [], cost: 0 })).toBeNull();
  expect(readSavedDraft({ decisions: [{ measureId: "M12", districtId: "nura" }] })).toBeNull();
  expect(readSavedDraft({ decisions: [{ measureId: "M7", districtId: "unknown" }] })).toBeNull();
  expect(readSavedDraft({ decisions: [...exampleDecisions, { measureId: "M14" }] })).toBeNull();
});

it("keeps domain budget/conflict validation for drafts and normalizes complete saved plans", () => {
  const scenario = { decisions: exampleDecisions };
  const validation = simulationEngine.validate(scenario);
  expect(validation.valid).toBe(true);
  if (!validation.valid) throw new Error("Organizer example must remain valid");
  expect(readSavedDraft(scenario)).toEqual(validation.scenario);
  expect(draftIssues({ decisions: [{ measureId: "M1", districtId: "nura" }, { measureId: "M3", districtId: "esil" }] })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INCOMPATIBLE_MEASURES" })]));
  expect(draftIssues({ decisions: [{ measureId: "M3", districtId: "nura" }, { measureId: "M7", districtId: "nura" }, { measureId: "M8", districtId: "nura" }, { measureId: "M13", districtId: "esil" }] })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BUDGET_EXCEEDED" })]));
});
