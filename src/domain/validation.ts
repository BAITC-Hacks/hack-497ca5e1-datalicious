import { z } from "zod";
import { dataset } from "@/data/dataset";
import type {
  Dataset,
  Decision,
  DistrictId,
  Measure,
  ValidationIssue,
  ValidationResult,
} from "./types";

const scenarioShape = z.object({ decisions: z.array(z.unknown()) }).strict();
const decisionShape = z.object({
  measureId: z.string(),
  districtId: z.string().optional(),
}).strict();

const measureIdOrder = (left: string, right: string): number => {
  const leftNumber = Number(left.slice(1));
  const rightNumber = Number(right.slice(1));
  return leftNumber - rightNumber || left.localeCompare(right);
};

function issue(
  code: ValidationIssue["code"],
  message: string,
  decisionIndexes?: readonly number[],
): ValidationIssue {
  return decisionIndexes === undefined ? { code, message } : { code, message, decisionIndexes };
}

export function validateScenario(input: unknown, sourceDataset: Dataset = dataset): ValidationResult {
  const scenarioResult = scenarioShape.safeParse(input);
  if (!scenarioResult.success) {
    return invalid([issue("INVALID_SHAPE", "Ожидается объект с массивом decisions без лишних полей.")]);
  }

  const issues: ValidationIssue[] = [];
  const decisions: Decision[] = [];
  const originalDecisions = scenarioResult.data.decisions;

  if (originalDecisions.length !== sourceDataset.rules.requiredDecisions) {
    issues.push(issue(
      "DECISION_COUNT",
      `Нужно выбрать ровно ${sourceDataset.rules.requiredDecisions} мероприятий; получено ${originalDecisions.length}.`,
    ));
  }

  const parsedRows: Array<{ decision: Decision; index: number; measure: Measure }> = [];
  originalDecisions.forEach((rawDecision, index) => {
    const parsed = decisionShape.safeParse(rawDecision);
    if (!parsed.success) {
      issues.push(issue("INVALID_SHAPE", `Решение №${index + 1} имеет неверный формат.`, [index]));
      return;
    }

    const measure = sourceDataset.measures.find(({ id }) => id === parsed.data.measureId);
    if (!measure) {
      issues.push(issue("UNKNOWN_MEASURE", `Неизвестное мероприятие ${parsed.data.measureId}.`, [index]));
      return;
    }

    const hasDistrictProperty = Object.hasOwn(rawDecision as object, "districtId");
    if (measure.scope === "district") {
      if (typeof parsed.data.districtId !== "string" || parsed.data.districtId.length === 0) {
        issues.push(issue("DISTRICT_REQUIRED", `Для районной меры ${measure.id} нужно указать район.`, [index]));
        return;
      }
      const district = sourceDataset.districts.find(({ id }) => id === parsed.data.districtId);
      if (!district) {
        issues.push(issue("UNKNOWN_DISTRICT", `Неизвестный район ${parsed.data.districtId}.`, [index]));
        return;
      }
      parsedRows.push({
        decision: { measureId: measure.id as Decision["measureId"], districtId: district.id as DistrictId } as Decision,
        index,
        measure,
      });
      return;
    }

    if (hasDistrictProperty) {
      issues.push(issue("DISTRICT_FORBIDDEN", `Для городской меры ${measure.id} район указывать нельзя.`, [index]));
      return;
    }
    parsedRows.push({ decision: { measureId: measure.id as Decision["measureId"] } as Decision, index, measure });
  });

  const knownRows = originalDecisions.flatMap((rawDecision, index) => {
    const parsed = decisionShape.safeParse(rawDecision);
    if (!parsed.success) return [];
    const measure = sourceDataset.measures.find(({ id }) => id === parsed.data.measureId);
    return measure ? [{ measure, index, rawDecision: parsed.data }] : [];
  });

  const rowsByMeasure = new Map<string, number[]>();
  for (const { measure, index } of knownRows) {
    const indexes = rowsByMeasure.get(measure.id) ?? [];
    indexes.push(index);
    rowsByMeasure.set(measure.id, indexes);
  }
  for (const [measureId, indexes] of rowsByMeasure) {
    if (indexes.length > 1) {
      issues.push(issue(
        "DUPLICATE_MEASURE",
        `Мероприятие ${measureId} можно выбрать только один раз.`,
        indexes,
      ));
    }
  }

  const totalCost = knownRows.reduce((sum, { measure }) => sum + measure.cost, 0);
  if (totalCost > sourceDataset.rules.budget) {
    issues.push(issue("BUDGET_EXCEEDED", `Стоимость ${totalCost} превышает бюджет ${sourceDataset.rules.budget}.`));
  }

  const rowsByDirection = new Map<string, number[]>();
  for (const { measure, index } of knownRows) {
    const indexes = rowsByDirection.get(measure.direction) ?? [];
    indexes.push(index);
    rowsByDirection.set(measure.direction, indexes);
  }
  for (const [direction, indexes] of rowsByDirection) {
    if (indexes.length > sourceDataset.rules.maxPerDirection) {
      issues.push(issue(
        "DIRECTION_LIMIT",
        `В направлении ${direction} выбрано ${indexes.length} мероприятий; максимум — ${sourceDataset.rules.maxPerDirection}.`,
        indexes,
      ));
    }
  }

  for (const incompatibility of sourceDataset.incompatibilities) {
    const [firstId, secondId] = incompatibility.pair;
    const firstRows = knownRows.filter(({ measure }) => measure.id === firstId);
    const secondRows = knownRows.filter(({ measure }) => measure.id === secondId);
    for (const first of firstRows) {
      for (const second of secondRows) {
        const sameDistrict = first.rawDecision.districtId === second.rawDecision.districtId;
        if (incompatibility.scope === "anywhere" || sameDistrict) {
          issues.push(issue(
            "INCOMPATIBLE_MEASURES",
            incompatibility.reason,
            [first.index, second.index],
          ));
        }
      }
    }
  }

  if (issues.length > 0) return invalid(issues);

  const normalized = parsedRows
    .map(({ decision }) => decision)
    .sort((left, right) => measureIdOrder(left.measureId, right.measureId));
  const spent = totalCost;
  decisions.push(...normalized);
  return {
    valid: true,
    scenario: { decisions },
    budget: { spent, remaining: sourceDataset.rules.budget - spent },
    validationErrors: [],
  };
}

function invalid(issues: readonly ValidationIssue[]): ValidationResult {
  return { valid: false, issues, validationErrors: issues };
}
