import "server-only";
import { dataset } from "@/data/dataset";
import type { AiAnalysis, DistrictId, IndicatorId, SimulationResult } from "@/domain/types";

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
const districtName = (id: DistrictId) => dataset.districts.find(d => d.id === id)?.name ?? id;
const indicatorName = (id: IndicatorId) => dataset.indicators.find(i => i.id === id)?.name ?? id;

/** Presentation of trusted domain facts only; no score formula or network dependency. */
export function createFallbackAnalysis(result: SimulationResult): AiAnalysis {
  const strengths: string[] = [];
  const risks: string[] = [];
  const consequences: string[] = [];
  const recommendations: string[] = [];

  for (const delta of result.districtDeltas) {
    if (delta.score > 0) {
      strengths.push(`${districtName(delta.districtId)}: оценка района выросла на ${number.format(delta.score)}.`);
    }
    if (delta.score < 0) {
      risks.push(`${districtName(delta.districtId)}: изменение оценки района ${signed.format(delta.score)}.`);
    }
    for (const indicator of dataset.indicators) {
      const change = delta.indicators[indicator.id];
      if (change < 0) {
        risks.push(`${districtName(delta.districtId)}: ${indicator.name} — изменение ${signed.format(change)}.`);
      }
    }
  }

  const critical = result.after.criticalIndicators;
  if (critical.length === 0) {
    strengths.push("После решений движок не выявил критических показателей.");
  } else {
    for (const item of critical) {
      risks.push(`${districtName(item.districtId)}: ${indicatorName(item.indicatorId)} — ${number.format(item.value)}, критическое значение по результату движка.`);
    }
    recommendations.push("Рассмотрите замены мер для районов с оставшимися критическими показателями и проверьте новый набор расчётом.");
  }

  const weakest = result.after.districts.filter(d => d.score === result.after.weakestDistrictScore);
  if (weakest.length > 0) {
    consequences.push(`Минимальная оценка района после решений: ${number.format(result.after.weakestDistrictScore)} (${weakest.map(d => districtName(d.districtId)).join(", ")}).`);
  }
  consequences.push(`Средневзвешенная оценка города после решений: ${number.format(result.after.populationWeightedAverage)}.`);
  consequences.push(`Критических показателей до решений: ${result.baseline.criticalIndicators.length}; после: ${critical.length}.`);

  for (const contribution of result.contributions) {
    if (contribution.source.kind === "synergy") {
      const pair = contribution.source.pair.join(" + ");
      consequences.push(`В районе ${districtName(contribution.districtId)} сработала синергия ${pair}. Её эффект уже учтён движком.`);
    }
  }

  if (result.scoreDelta < 0) {
    risks.push(`Итоговый Score снизился: изменение ${signed.format(result.scoreDelta)}.`);
  }
  if (result.budget.remaining > 0) {
    consequences.push(`Осталось ${number.format(result.budget.remaining)} единиц бюджета; остаток сам по себе не даёт бонуса.`);
  }
  recommendations.push("Сравнивайте варианты замены в пределах пяти решений; допустимость и эффект нового набора должен проверить движок.");
  recommendations.push("Это объяснение условной модели. Оно не является прогнозом фактических изменений в городе.");

  return {
    summary: `Резервное объяснение без LLM. Astana Quality of Life Score: ${number.format(result.baseline.score)} → ${number.format(result.after.score)}; изменение ${signed.format(result.scoreDelta)}. Потрачено ${number.format(result.budget.spent)}, остаток ${number.format(result.budget.remaining)}.`,
    strengths,
    risks,
    consequences,
    recommendations,
  };
}
