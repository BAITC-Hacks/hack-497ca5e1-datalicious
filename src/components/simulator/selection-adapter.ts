import { dataset } from "@/data/dataset";
import type {
  Decision,
  Direction,
  Measure,
  Scenario,
  SimulationEngine,
  ValidationIssue,
} from "@/domain/types";

const measures: readonly Measure[] = dataset.measures;

/** TEMPORARY UI adapter, not the authoritative domain validator.
 * Replace selectionAdapter with the shared engine when participant 1 merges it.
 * No score or effect calculation belongs here. Accepts partial drafts; their only
 * expected validation issue is DECISION_COUNT. Also guards imported saved drafts.
 */
export const selectionAdapter: Pick<SimulationEngine, "validate"> = {
  validate(input) {
    if (
      !input ||
      typeof input !== "object" ||
      !("decisions" in input) ||
      !Array.isArray(input.decisions)
    ) {
      return {
        valid: false,
        issues: [
          { code: "INVALID_SHAPE", message: "Не удалось прочитать сценарий." },
        ],
      };
    }
    const issues: ValidationIssue[] = [];
    const decisions: Decision[] = [];
    const seen = new Set<string>();
    const counts: Partial<Record<Direction, number>> = {};
    let spent = 0;
    input.decisions.forEach((raw: unknown, index: number) => {
      const issue = (code: ValidationIssue["code"], message: string) =>
        issues.push({ code, message, decisionIndexes: [index] });
      if (!raw || typeof raw !== "object" || !("measureId" in raw)) {
        issue("INVALID_SHAPE", "Неверный формат мероприятия.");
        return;
      }
      const measure = measures.find((m) => m.id === raw.measureId);
      if (!measure) {
        issue("UNKNOWN_MEASURE", "Неизвестное мероприятие.");
        return;
      }
      if (seen.has(measure.id))
        issue("DUPLICATE_MEASURE", `${measure.id} уже есть в вашем плане.`);
      seen.add(measure.id);
      spent += measure.cost;
      counts[measure.direction] = (counts[measure.direction] ?? 0) + 1;
      if (
        Object.keys(raw).some(
          (key) => key !== "measureId" && key !== "districtId",
        )
      ) {
        issue("INVALID_SHAPE", "Мероприятие содержит неизвестные поля.");
      }
      if (measure.scope === "city") {
        if ("districtId" in raw)
          issue(
            "DISTRICT_FORBIDDEN",
            `${measure.id} действует на весь город — район не нужен.`,
          );
        decisions.push({ measureId: measure.id });
      } else {
        if (!("districtId" in raw) || !raw.districtId) {
          issue("DISTRICT_REQUIRED", `Выберите район для ${measure.id}.`);
          return;
        }
        const district = dataset.districts.find((d) => d.id === raw.districtId);
        if (!district) {
          issue("UNKNOWN_DISTRICT", "Выберите район из списка.");
          return;
        }
        decisions.push({ measureId: measure.id, districtId: district.id });
      }
    });
    if (input.decisions.length !== dataset.rules.requiredDecisions) {
      issues.push({
        code: "DECISION_COUNT",
        message: `Нужно выбрать ровно ${dataset.rules.requiredDecisions} мероприятий.`,
      });
    }
    if (spent > dataset.rules.budget)
      issues.push({
        code: "BUDGET_EXCEEDED",
        message: `Не хватает ${spent - dataset.rules.budget} ед. бюджета.`,
      });
    if (
      Object.values(counts).some(
        (count) => count > dataset.rules.maxPerDirection,
      )
    ) {
      issues.push({
        code: "DIRECTION_LIMIT",
        message: `Можно выбрать не больше ${dataset.rules.maxPerDirection} мер одного направления.`,
      });
    }
    for (const conflict of dataset.incompatibilities) {
      const a = decisions.find((d) => d.measureId === conflict.pair[0]);
      const b = decisions.find((d) => d.measureId === conflict.pair[1]);
      if (
        a &&
        b &&
        (conflict.scope === "anywhere" || a.districtId === b.districtId)
      ) {
        issues.push({
          code: "INCOMPATIBLE_MEASURES",
          message: `${a.measureId} и ${b.measureId} несовместимы${conflict.scope === "same-district" ? " в одном районе" : ""}. ${conflict.reason}`,
        });
      }
    }
    if (issues.length) return { valid: false, issues };
    return {
      valid: true,
      scenario: { decisions },
      budget: { spent, remaining: dataset.rules.budget - spent },
    };
  },
};

export function draftIssues(scenario: Scenario): readonly ValidationIssue[] {
  const result = selectionAdapter.validate(scenario);
  if (result.valid) return [];
  return result.issues.filter(
    (issue) =>
      issue.code !== "DECISION_COUNT" ||
      scenario.decisions.length > dataset.rules.requiredDecisions,
  );
}

export function selectionCost(decisions: readonly Decision[]) {
  return decisions.reduce(
    (sum, decision) =>
      sum + (measures.find((m) => m.id === decision.measureId)?.cost ?? 0),
    0,
  );
}

/** Normalize only safe partial/complete selections loaded from untrusted storage. */
export function readSavedDraft(raw: unknown): Scenario | null {
  const validation = selectionAdapter.validate(raw);
  if (validation.valid) return validation.scenario;
  if (validation.issues.some((issue) => issue.code !== "DECISION_COUNT"))
    return null;
  const scenario = raw as Scenario;
  if (scenario.decisions.length > dataset.rules.requiredDecisions) return null;
  return {
    decisions: scenario.decisions.map((d) =>
      d.districtId
        ? ({ measureId: d.measureId, districtId: d.districtId } as Decision)
        : ({ measureId: d.measureId } as Decision),
    ),
  };
}
