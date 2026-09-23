import "server-only";
import { dataset } from "@/data/dataset";
import type { AiAnalysis, SimulationResult } from "@/domain/types";
import { createFallbackAnalysis } from "./fallback";

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 5 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 5, signDisplay: "exceptZero" });

/** The agent selects a verified ID; no model-written numbers or assertions are rendered. */
export function createAgentAnalysis(original: SimulationResult, best: SimulationResult, id: string,
  attempts: number, validAlternatives: number): AiAnalysis {
  const facts = createFallbackAnalysis(original);
  const originalExplanation = {
    strengths: facts.strengths.map(text => `Исходный сценарий: ${text}`),
    risks: facts.risks.map(text => `Исходный сценарий: ${text}`),
    consequences: facts.consequences.map(text => `Исходный сценарий: ${text}`),
  };
  const gain = best.after.score - original.after.score;
  const overview = `Поиск AI-агента завершён. Проверено альтернатив: ${attempts}, допустимых: ${validAlternatives}. Исходный Score: ${number.format(original.after.score)}.`;
  if (gain <= 0) {
    return {
      ...originalExplanation,
      summary: `${overview} Улучшения среди проверенных вариантов не найдено; сохранён исходный сценарий. Глобальный оптимум не установлен.`,
      recommendations: ["Исходные решения не изменены. Можно повторить поиск с другими предложениями; улучшение не гарантируется."],
    };
  }
  const decisions = best.scenario.decisions.map(d => {
    const measure = dataset.measures.find(m => m.id === d.measureId);
    const district = d.districtId ? dataset.districts.find(item => item.id === d.districtId)?.name ?? d.districtId : "весь город";
    return `${d.measureId} — ${measure?.name ?? d.measureId} (${district})`;
  });
  const tradeoffs: string[] = [];
  for (const after of best.after.districts) {
    const before = original.after.districts.find(d => d.districtId === after.districtId);
    if (!before) continue;
    for (const indicator of dataset.indicators) {
      const delta = after.indicators[indicator.id] - before.indicators[indicator.id];
      if (delta < 0) {
        const district = dataset.districts.find(d => d.id === after.districtId)?.name ?? after.districtId;
        tradeoffs.push(`${district}, ${indicator.name}: ${signed.format(delta)} относительно исходного сценария`);
      }
    }
  }
  return {
    ...originalExplanation,
    summary: `${overview} Найдено улучшение, но исходные решения не изменены. Лучший среди проверенных вариантов — ${id}; глобальный оптимум не установлен.`,
    recommendations: [
      `Проверенная альтернатива ${id}: ${decisions.join("; ")}.`,
      `Score альтернативы: ${number.format(best.after.score)}; отличие от исходного сценария: ${signed.format(gain)}. Расходы: ${number.format(best.budget.spent)}, остаток: ${number.format(best.budget.remaining)}.`,
      `Оценка слабейшего района: ${number.format(original.after.weakestDistrictScore)} → ${number.format(best.after.weakestDistrictScore)}. Критических показателей: ${original.after.criticalIndicators.length} → ${best.after.criticalIndicators.length}.`,
      ...(tradeoffs.length ? tradeoffs.map(text => `Компромисс альтернативы: ${text}.`) : ["Среди показателей районов проверенной альтернативы ухудшений относительно исходного сценария не найдено."]),
      "Альтернатива — предложение. Вы можете вручную выбрать эти пять решений и заново выполнить расчёт; автоматически они не применены.",
      "Это результат условной модели, а не прогноз фактических изменений в городе.",
    ],
  };
}
