import { dataset, exampleDecisions } from "@/data/dataset";
import type { AiAnalysis, DistrictId, Indicators, SimulationResult } from "@/domain/types";

/** Hand-checked facts from docs/DATASET.md, NOT a replacement simulation engine. */
export function createResultFixture(): SimulationResult {
  const baselineScores: Record<DistrictId, number> = {
    esil: 62.99, almaty: 57.06, saryarka: 54.65, baikonur: 56.63, nura: 49.18,
  };
  const afterScores: Record<DistrictId, number> = {
    esil: 63.4275, almaty: 57.4975, saryarka: 56.3, baikonur: 57.0675, nura: 52.9625,
  };
  const afterValues: Record<DistrictId, Partial<Indicators>> = {
    esil: { C2: 74.375 },
    almaty: { C2: 64.375 },
    saryarka: { E2: 48.75, C1: 47.5, C2: 59.375 },
    baikonur: { C2: 62.375 },
    nura: { S1: 48, S2: 43.75, B1: 67.5, B2: 51.75, C2: 54.375 },
  };
  const zero: Indicators = { T1: 0, T2: 0, E1: 0, E2: 0, S1: 0, S2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  return structuredClone({
    datasetVersion: dataset.version,
    scenario: { decisions: exampleDecisions },
    budget: { spent: 95, remaining: 5 },
    baseline: {
      districts: dataset.districts.map(d => ({ districtId: d.id, indicators: d.indicators, score: baselineScores[d.id] })),
      populationWeightedAverage: 56.8624,
      weakestDistrictScore: 49.18,
      criticalIndicators: [
        { districtId: "nura", indicatorId: "S1", value: 38 },
        { districtId: "nura", indicatorId: "S2", value: 35 },
      ],
      score: 52.55768,
    },
    after: {
      districts: dataset.districts.map(d => ({ districtId: d.id, indicators: { ...d.indicators, ...afterValues[d.id] }, score: afterScores[d.id] })),
      populationWeightedAverage: 58.0776,
      weakestDistrictScore: 52.9625,
      criticalIndicators: [],
      score: 56.54307,
    },
    scoreDelta: 3.98539,
    districtDeltas: [
      { districtId: "esil", indicators: { ...zero, C2: 4.375 }, score: 0.4375 },
      { districtId: "almaty", indicators: { ...zero, C2: 4.375 }, score: 0.4375 },
      { districtId: "saryarka", indicators: { ...zero, E2: 8.75, C1: 2.5, C2: 4.375 }, score: 1.65 },
      { districtId: "baikonur", indicators: { ...zero, C2: 4.375 }, score: 0.4375 },
      { districtId: "nura", indicators: { ...zero, S1: 10, S2: 8.75, B1: 12.5, B2: 1.75, C2: 4.375 }, score: 3.7825 },
    ],
    contributions: [
      { source: { kind: "measure", measureId: "M7" }, districtId: "nura", effects: { S1: 10 } },
      { source: { kind: "measure", measureId: "M8" }, districtId: "nura", effects: { S2: 8.75 } },
      { source: { kind: "measure", measureId: "M10" }, districtId: "nura", effects: { B1: 10.5, B2: 1.75 } },
      ...dataset.districts.map(d => ({ source: { kind: "measure" as const, measureId: "M12" as const }, districtId: d.id, effects: { C2: 4.375 } })),
      { source: { kind: "measure", measureId: "M5" }, districtId: "saryarka", effects: { E2: 8.75, C1: 2.5 } },
      { source: { kind: "synergy", pair: ["M10", "M12"] }, districtId: "nura", effects: { B1: 2 } },
    ],
  } satisfies SimulationResult);
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
