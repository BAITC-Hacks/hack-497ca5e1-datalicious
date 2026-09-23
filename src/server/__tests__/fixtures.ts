import { exampleDecisions } from "@/data/dataset";
import { evaluateScenario } from "@/domain";
import type { AiAnalysis, EvaluationResult, SimulationResult, ValidationIssue } from "@/domain/types";

/** Organizer example evaluated by the real public engine; never a replacement formula.
 * Tests that overwrite facts for protocol/presentation checks must label those values artificial.
 */
export function createResultFixture(): SimulationResult {
  const evaluation = evaluateScenario({ decisions: exampleDecisions });
  if (!evaluation.ok) throw new Error("The organizer example must be accepted by the domain engine.");
  return structuredClone(evaluation.result);
}

/** Contract-shaped domain refusal double, not an alternative validator. */
export function invalidEvaluation(issues: readonly ValidationIssue[]): Extract<EvaluationResult, { readonly ok: false }> {
  const copy = structuredClone(issues);
  return { ok: false, valid: false, issues: copy, validationErrors: copy };
}

export const analysisFixture: AiAnalysis = {
  summary: "По расчёту движка качество жизни улучшилось, критических показателей не осталось.",
  strengths: ["В Нуре улучшились показатели социальной инфраструктуры."],
  risks: [],
  consequences: ["Сработала синергия освещения и цифровой платформы обращений."],
  recommendations: ["Сравните варианты замены мер отдельным расчётом."],
};

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
