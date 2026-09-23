import { dataset } from "@/data/dataset";
import type { DistrictId, ScoreSnapshot } from "@/domain/types";

/** TEMPORARY baseline fixture from docs/DATASET.md, organizers-v1 only.
 * Replace with engine.baseline() at integration. No Score formula in the UI.
 */
const districtScores: Record<DistrictId, number> = {
  esil: 62.99,
  almaty: 57.06,
  saryarka: 54.65,
  baikonur: 56.63,
  nura: 49.18,
};
export const baselineFixture: ScoreSnapshot = {
  score: 52.55768,
  populationWeightedAverage: 56.8624,
  weakestDistrictScore: 49.18,
  districts: dataset.districts.map((d) => ({
    districtId: d.id,
    indicators: d.indicators,
    score: districtScores[d.id],
  })),
  criticalIndicators: [
    { districtId: "nura", indicatorId: "S1", value: 38 },
    { districtId: "nura", indicatorId: "S2", value: 35 },
  ],
};
