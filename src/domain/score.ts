import type {
  Dataset,
  DistrictId,
  DistrictScore,
  Indicators,
  ScoreSnapshot,
} from "./types";

export function clipIndicatorValue(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function createScoreSnapshot(
  districtIndicators: Readonly<Record<DistrictId, Indicators>>,
  sourceDataset: Dataset,
): ScoreSnapshot {
  const districts: DistrictScore[] = sourceDataset.districts.map((district) => {
    const indicators = districtIndicators[district.id];
    const score = sourceDataset.indicators.reduce(
      (total, indicator) => total + indicator.weight * indicators[indicator.id],
      0,
    );
    return { districtId: district.id, indicators, score };
  });

  const populationWeightedAverage = districts.reduce((total, districtScore) => {
    const district = sourceDataset.districts.find(({ id }) => id === districtScore.districtId)!;
    return total + district.populationShare * districtScore.score;
  }, 0);
  const weakestDistrictScore = Math.min(...districts.map(({ score }) => score));
  const criticalIndicators = sourceDataset.districts.flatMap((district) =>
    sourceDataset.indicators.flatMap((indicator) => {
      const value = districtIndicators[district.id][indicator.id];
      return value < sourceDataset.rules.criticalThreshold
        ? [{ districtId: district.id, indicatorId: indicator.id, value }]
        : [];
    }),
  );
  const score = sourceDataset.rules.averageWeight * populationWeightedAverage
    + sourceDataset.rules.weakestDistrictWeight * weakestDistrictScore
    - sourceDataset.rules.criticalPenalty * criticalIndicators.length;

  return {
    districts,
    populationWeightedAverage,
    weakestDistrictScore,
    criticalIndicators,
    score,
  };
}
