import { dataset } from "@/data/dataset";
import type {
  Dataset,
  Decision,
  DecisionContribution,
  DistrictId,
  EffectContribution,
  EvaluationResult,
  FiredSynergy,
  IndicatorId,
  Indicators,
  Measure,
  SimulationEngine,
  SimulationResult,
  ValidationResult,
} from "./types";
import { createScoreSnapshot, clipIndicatorValue } from "./score";
import { validateScenario } from "./validation";

function cloneBaseline(sourceDataset: Dataset): Record<DistrictId, Indicators> {
  return Object.fromEntries(sourceDataset.districts.map((district) => [
    district.id,
    { ...district.indicators },
  ])) as Record<DistrictId, Indicators>;
}

function measureDistrictIds(measure: Measure, decision: Decision, sourceDataset: Dataset): DistrictId[] {
  if (measure.scope === "city") return sourceDataset.districts.map(({ id }) => id);
  return "districtId" in decision && decision.districtId ? [decision.districtId] : [];
}

function decisionMeasure(
  decision: Decision,
  sourceDataset: Dataset,
): Measure {
  return sourceDataset.measures.find(({ id }) => id === decision.measureId)!;
}

export function createSimulationEngine(sourceDataset: Dataset = dataset): SimulationEngine {
  const getBaseline = () => {
    const indicators = cloneBaseline(sourceDataset);
    return createScoreSnapshot(indicators, sourceDataset);
  };

  const validate = (input: unknown): ValidationResult => validateScenario(input, sourceDataset);

  const evaluate = (input: unknown): EvaluationResult => {
    const validation = validate(input);
    if (!validation.valid) {
      return {
        ok: false,
        valid: false,
        issues: validation.issues,
        validationErrors: validation.validationErrors,
      };
    }

    const before = cloneBaseline(sourceDataset);
    const after = cloneBaseline(sourceDataset);
    const contributions: EffectContribution[] = [];
    const decisionContributions: DecisionContribution[] = [];

    for (const decision of validation.scenario.decisions) {
      const measure = decisionMeasure(decision, sourceDataset);
      const realizedFraction = (sourceDataset.rules.horizonQuarters - measure.lagQuarters)
        / sourceDataset.rules.horizonQuarters;
      const realizedEffects = Object.fromEntries(
        Object.entries(measure.effects).map(([indicatorId, value]) => [
          indicatorId,
          value * realizedFraction,
        ]),
      ) as Partial<Record<IndicatorId, number>>;
      const districtIds = measureDistrictIds(measure, decision, sourceDataset);

      decisionContributions.push({
        measureId: measure.id,
        direction: measure.direction,
        cost: measure.cost,
        lagQuarters: measure.lagQuarters,
        realizedFraction,
        districtIds,
        fullEffects: { ...measure.effects },
        realizedEffects,
      });

      for (const districtId of districtIds) {
        for (const [indicatorId, effect] of Object.entries(realizedEffects) as [IndicatorId, number][]) {
          const accumulator = after[districtId] as Record<IndicatorId, number>;
          accumulator[indicatorId] += effect;
        }
        contributions.push({
          source: { kind: "measure", measureId: measure.id },
          districtId,
          effects: realizedEffects,
        });
      }
    }

    const firedSynergies: FiredSynergy[] = [];
    for (const synergy of sourceDataset.synergies) {
      const [districtMeasureId, cityMeasureId] = synergy.pair;
      const districtDecision = validation.scenario.decisions.find(({ measureId }) => measureId === districtMeasureId);
      const cityDecision = validation.scenario.decisions.find(({ measureId }) => measureId === cityMeasureId);
      if (!districtDecision || !cityDecision || !("districtId" in districtDecision)) continue;

      const districtId = districtDecision.districtId;
      const synergyEffects = { ...synergy.effects };
      firedSynergies.push({ pair: [...synergy.pair], districtId, effects: synergyEffects });
      for (const [indicatorId, effect] of Object.entries(synergy.effects) as [IndicatorId, number][]) {
        const accumulator = after[districtId] as Record<IndicatorId, number>;
        accumulator[indicatorId] += effect;
      }
      contributions.push({
        source: { kind: "synergy", pair: [...synergy.pair] },
        districtId,
        effects: synergyEffects,
      });
    }

    for (const district of sourceDataset.districts) {
      for (const indicator of sourceDataset.indicators) {
        const mutableIndicators = after[district.id] as Record<IndicatorId, number>;
        mutableIndicators[indicator.id] = clipIndicatorValue(mutableIndicators[indicator.id]);
      }
    }

    const baseline = createScoreSnapshot(before, sourceDataset);
    const afterSnapshot = createScoreSnapshot(after, sourceDataset);
    const baselineById = new Map(baseline.districts.map((district) => [district.districtId, district]));
    const districtDeltas = afterSnapshot.districts.map((district) => {
      const baselineDistrict = baselineById.get(district.districtId)!;
      return {
        districtId: district.districtId,
        indicators: Object.fromEntries(sourceDataset.indicators.map(({ id }) => [
          id,
          district.indicators[id] - baselineDistrict.indicators[id],
        ])) as Indicators,
        score: district.score - baselineDistrict.score,
      };
    });
    const result: SimulationResult = {
      valid: true,
      validationErrors: [],
      datasetVersion: sourceDataset.version,
      scenario: validation.scenario,
      budget: validation.budget,
      totalCost: validation.budget.spent,
      remainingBudget: validation.budget.remaining,
      baselineScore: baseline.score,
      finalScore: afterSnapshot.score,
      indicatorsBefore: baseline.districts,
      indicatorsAfter: afterSnapshot.districts,
      baseline,
      after: afterSnapshot,
      scoreDelta: afterSnapshot.score - baseline.score,
      districtDeltas,
      decisionContributions,
      synergies: firedSynergies,
      contributions,
    };
    return { ok: true, result };
  };

  return { validate, evaluate, baseline: getBaseline };
}

export const simulationEngine = createSimulationEngine();

export function evaluateScenario(input: unknown): EvaluationResult {
  return simulationEngine.evaluate(input);
}

export function getBaselineScore(): number {
  return simulationEngine.baseline().score;
}
