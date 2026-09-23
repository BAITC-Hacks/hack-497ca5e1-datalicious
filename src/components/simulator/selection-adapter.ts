import { dataset } from "@/data/dataset";
import { simulationEngine } from "@/domain";
import type { Decision, Scenario, ValidationIssue } from "@/domain/types";

/** Compatibility name for the selection UI. All validation belongs to the domain. */
export const selectionAdapter = simulationEngine;

/** A draft may be incomplete, but no other domain issue is ignored. */
export function draftIssues(scenario: Scenario): readonly ValidationIssue[] {
  const result = simulationEngine.validate(scenario);
  if (result.valid) return [];
  return result.issues.filter(
    (issue) =>
      issue.code !== "DECISION_COUNT" ||
      scenario.decisions.length > dataset.rules.requiredDecisions,
  );
}

/** Display-only sum for incomplete drafts; final/API budgets come from the engine. */
export function selectionCost(decisions: readonly Decision[]) {
  return decisions.reduce(
    (sum, decision) =>
      sum + (dataset.measures.find((m) => m.id === decision.measureId)?.cost ?? 0),
    0,
  );
}

/** Normalize only safe partial/complete selections loaded from untrusted storage. */
export function readSavedDraft(raw: unknown): Scenario | null {
  const validation = simulationEngine.validate(raw);
  if (validation.valid) return validation.scenario;
  if (validation.issues.some((issue) => issue.code !== "DECISION_COUNT"))
    return null;
  // The domain has checked the full shape and every row. Only draft length remains.
  const scenario = raw as Scenario;
  if (scenario.decisions.length > dataset.rules.requiredDecisions) return null;
  return { decisions: scenario.decisions.map((decision) => ({ ...decision })) };
}
