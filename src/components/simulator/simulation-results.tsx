"use client";

import { useEffect, useRef } from "react";
import { dataset } from "@/data/dataset";
import type { DistrictId, SimulationResult } from "@/domain/types";
import { formatEffects, formatNumber } from "./presentation";
import { ScenarioAnalysis } from "./scenario-analysis";

const districtName = (id: DistrictId) => dataset.districts.find((district) => district.id === id)!.name;
const signed = (value: number, digits = 2) => `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;

export function SimulationResults({ result, onClose, onReset }: {
  result: SimulationResult;
  onClose: () => void;
  onReset: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  const weakest = result.after.districts.filter((district) => district.score === result.after.weakestDistrictScore);
  const declines = result.districtDeltas.flatMap((district) => dataset.indicators
    .filter((indicator) => district.indicators[indicator.id] < 0)
    .map((indicator) => ({ districtId: district.districtId, indicator, delta: district.indicators[indicator.id] })));

  return (
    <div className="result-backdrop">
      <section
        ref={dialog}
        className="simulation-results"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onClose(); }
          if (event.key !== "Tab") return;
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], summary, [tabindex="0"]',
          ) ?? []).filter((element) => !element.closest("details:not([open])") || element.tagName === "SUMMARY");
          const first = controls[0];
          const last = controls.at(-1);
          if (!first || !last) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}
      >
        <header className="result-header">
          <div><p>Демонстрация завершена</p><h2 id="result-title">Результат расчёта</h2></div>
          <button onClick={onClose} aria-label="Закрыть результат">×</button>
        </header>
        <p>Модель на горизонте {dataset.rules.horizonQuarters} кварталов. Реальные работы не запускались.</p>
        <dl className="result-metrics">
          <div><dt>Astana Quality of Life Score</dt><dd data-testid="final-score">{formatNumber(result.after.score, 5)}</dd></div>
          <div><dt>Изменение Score</dt><dd>{signed(result.scoreDelta, 5)}</dd><small>Исходный: {formatNumber(result.baseline.score, 5)}</small></div>
          <div><dt>Бюджет</dt><dd data-testid="result-budget">{formatNumber(result.budget.spent)} / {dataset.rules.budget}</dd><small>Остаток: {formatNumber(result.budget.remaining)} ед.</small></div>
        </dl>
        <section className="result-section" aria-labelledby="district-results-title">
          <h3 id="district-results-title">Районы и показатели до / после</h3>
          <p>Самый слабый район: {weakest.map((district) => districtName(district.districtId)).join(", ")} — {formatNumber(result.after.weakestDistrictScore, 4)}.</p>
          <div className="result-districts">
            {result.after.districts.map((after) => {
              const before = result.baseline.districts.find((district) => district.districtId === after.districtId)!;
              const delta = result.districtDeltas.find((district) => district.districtId === after.districtId)!;
              return (
                <details key={after.districtId}>
                  <summary><strong>{districtName(after.districtId)}</strong><span>{formatNumber(before.score, 2)} → {formatNumber(after.score, 4)} <small>({signed(delta.score, 4)})</small></span></summary>
                  <table aria-label={`Показатели до и после: ${districtName(after.districtId)}`}>
                    <thead><tr><th scope="col">Показатель</th><th scope="col">До</th><th scope="col">После</th><th scope="col">Δ</th></tr></thead>
                    <tbody>{dataset.indicators.map((indicator) => (
                      <tr key={indicator.id} className={after.indicators[indicator.id] < dataset.rules.criticalThreshold ? "result-critical" : ""}>
                        <th scope="row">{indicator.id}<span>{indicator.name}</span></th>
                        <td>{formatNumber(before.indicators[indicator.id], 2)}</td>
                        <td>{formatNumber(after.indicators[indicator.id], 2)}{after.indicators[indicator.id] < dataset.rules.criticalThreshold && <span className="sr-only"> — критический показатель</span>}</td>
                        <td>{signed(delta.indicators[indicator.id])}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </details>
              );
            })}
          </div>
        </section>
        <section className="result-section" aria-labelledby="tradeoffs-title">
          <h3 id="tradeoffs-title">Критические значения и компромиссы</h3>
          <p>Критических показателей: {result.baseline.criticalIndicators.length} → {result.after.criticalIndicators.length}. Порог строго ниже {dataset.rules.criticalThreshold}.</p>
          {result.after.criticalIndicators.length > 0 && <ul>{result.after.criticalIndicators.map((critical) => <li key={`${critical.districtId}-${critical.indicatorId}`}>{districtName(critical.districtId)} · {critical.indicatorId}: {formatNumber(critical.value, 2)}</li>)}</ul>}
          {declines.length > 0 ? <ul>{declines.map((decline) => <li key={`${decline.districtId}-${decline.indicator.id}`}>{districtName(decline.districtId)} · {decline.indicator.id} {decline.indicator.name}: {signed(decline.delta)}.</li>)}</ul> : <p>Ухудшений отдельных показателей в этом расчёте нет.</p>}
        </section>
        <details className="result-section result-effects">
          <summary>Вклад пяти решений и сработавшие синергии</summary>
          <p>Реализованные эффекты до ограничения 0–100; это не отдельные слагаемые итогового Score.</p>
          <ul>{result.decisionContributions.map((contribution) => <li key={contribution.measureId}>
            <strong>{contribution.measureId} — {dataset.measures.find((measure) => measure.id === contribution.measureId)!.name}</strong>
            <p>{contribution.districtIds.map(districtName).join(", ")} · {contribution.cost} ед. · лаг {contribution.lagQuarters} кв.</p>
            <p>{formatEffects(contribution.realizedEffects)}</p>
          </li>)}</ul>
          <h3>Сработавшие синергии</h3>
          {result.synergies.length > 0 ? <ul>{result.synergies.map((synergy) => <li key={synergy.pair.join("+")}>{synergy.pair.join(" + ")} · {districtName(synergy.districtId)}: {formatEffects(synergy.effects)}</li>)}</ul> : <p>Синергии не сработали.</p>}
        </details>
        <ScenarioAnalysis result={result} />
        <footer className="result-actions">
          <button onClick={onClose}>Вернуться к городу →</button>
          <button onClick={onReset}>Новый сценарий</button>
        </footer>
      </section>
    </div>
  );
}
