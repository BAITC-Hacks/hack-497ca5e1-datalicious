import { useState } from "react";
import { dataset } from "@/data/dataset";
import type {
  Decision,
  Direction,
  DistrictId,
  Measure,
  Scenario,
} from "@/domain/types";
import { directions, formatNumber } from "../simulator/presentation";
import { draftIssues } from "../simulator/selection-adapter";
import { districtSummaries } from "./city-layout";
import { baselineFixture } from "../simulator/baseline-fixture";

export function DistrictPanel({
  target,
  scenario,
  onChange,
  onClose,
}: {
  target: DistrictId | "city";
  scenario: Scenario;
  onChange: (next: Scenario) => void;
  onClose: () => void;
}) {
  const district = dataset.districts.find((d) => d.id === target);
  const priorities = district
    ? [...dataset.indicators]
        .sort((a, b) => district.indicators[a.id] - district.indicators[b.id])
        .slice(0, 2)
    : [];
  const [direction, setDirection] = useState<Direction | "all">(
    priorities[0]?.direction ?? "all",
  );
  const measures: readonly Measure[] = dataset.measures;
  const relevant = measures.filter(
    (m) =>
      (target === "city" ? m.scope === "city" : m.scope === "district") &&
      (direction === "all" || m.direction === direction),
  );
  return (
    <aside className="district-panel" aria-labelledby="district-panel-title">
      <div className="district-panel-header">
        <p>{district ? "РАЙОН ГОРОДА" : "ОБЩЕГОРОДСКИЕ РЕШЕНИЯ"}</p>
        <button onClick={onClose} aria-label="Закрыть район">
          ×
        </button>
      </div>
      <h2 id="district-panel-title">{district?.name ?? "Весь город"}</h2>
      <p className="district-description">
        {district
          ? districtSummaries[district.id]
          : "Одна мера — эффект для всех пяти районов. Стоимость оплачивается один раз."}
      </p>
      {district && (
        <section className="district-data" aria-label="Состояние района">
          <div className="district-score-summary">
            <div>
              <span>Общая оценка района</span>
              <strong>
                {formatNumber(
                  baselineFixture.districts.find(
                    (d) => d.districtId === district.id,
                  )!.score,
                  2,
                )}
                <small> / 100</small>
              </strong>
            </div>
            <div>
              <span>Доля населения</span>
              <strong>
                {formatNumber(district.populationShare * 100)}
                <small>%</small>
              </strong>
            </div>
          </div>
          <div className="district-indicators">
            <div className="indicator-list-heading">
              <h3>Все 10 показателей</h3>
              <span>Исходное состояние</span>
            </div>
            <dl aria-label="Десять показателей района">
              {dataset.indicators.map((i) => (
                <div
                  key={i.id}
                  className={
                    district.indicators[i.id] < dataset.rules.criticalThreshold
                      ? "indicator-critical"
                      : ""
                  }
                >
                  <dt>
                    <span className="indicator-code">{i.id}</span>
                    {i.name}
                  </dt>
                  <dd
                    className={
                      district.indicators[i.id] <
                      dataset.rules.criticalThreshold
                        ? "is-critical"
                        : ""
                    }
                  >
                    {district.indicators[i.id]}
                    {district.indicators[i.id] <
                      dataset.rules.criticalThreshold && (
                      <>
                        <span aria-hidden="true"> !</span>
                        <span className="sr-only">
                          Ниже критического порога
                        </span>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="indicator-legend">
              <span>!</span> Ниже 40 — критический показатель
            </p>
          </div>
        </section>
      )}
      <div className="panel-catalog-heading">
        <h3>Что меняем?</h3>
        <span>До двух мер одного направления</span>
      </div>
      <div
        className="district-filters"
        role="group"
        aria-label="Направление мероприятий"
      >
        <button
          aria-pressed={direction === "all"}
          onClick={() => setDirection("all")}
        >
          Все
        </button>
        {directions
          .filter(
            (d) =>
              target !== "city" ||
              measures.some((m) => m.scope === "city" && m.direction === d.id),
          )
          .map((d) => (
            <button
              key={d.id}
              aria-pressed={direction === d.id}
              onClick={() => setDirection(d.id)}
            >
              {d.short}
            </button>
          ))}
      </div>
      <div className="district-measures">
        {relevant.map((measure) => {
          const existing = scenario.decisions.find(
            (d) => d.measureId === measure.id,
          );
          const candidate: Decision =
            measure.scope === "city"
              ? { measureId: measure.id }
              : { measureId: measure.id, districtId: target as DistrictId };
          const issue = existing
            ? `В плане: ${existing.districtId ? dataset.districts.find((d) => d.id === existing.districtId)?.name : "весь город"}`
            : scenario.decisions.length >= 5
              ? "Все пять мест заняты. Уберите меру из плана для замены."
              : draftIssues({
                  decisions: [...scenario.decisions, candidate],
                })[0]?.message;
          const synergy = dataset.synergies.find((s) =>
            s.pair.some((id) => id === measure.id),
          );
          return (
            <article
              className={`district-measure ${existing ? "chosen" : ""}`}
              key={measure.id}
              aria-labelledby={`measure-${measure.id}`}
            >
              <div className="district-measure-title">
                <span>{measure.id}</span>
                <h4 id={`measure-${measure.id}`}>{measure.name}</h4>
                <strong>
                  {measure.cost}
                  <small>ед.</small>
                </strong>
              </div>
              <details className="measure-explanation">
                <summary>Эффект и сроки</summary>
                <p>
                  Начало действия: через {measure.lagQuarters} кв. Полные
                  эффекты до учёта лага:
                </p>
                <ul>
                  {Object.entries(measure.effects).map(([id, value]) => (
                    <li key={id}>
                      {dataset.indicators.find((i) => i.id === id)?.name}
                      <strong>
                        {value > 0 ? "+" : ""}
                        {value}
                      </strong>
                    </li>
                  ))}
                </ul>
                {synergy && (
                  <p>
                    Дополнительный эффект с{" "}
                    {synergy.pair.find((id) => id !== measure.id)}. Бонус
                    действует в районе {synergy.pair[0]}.
                  </p>
                )}
              </details>
              <button
                className="choose-measure"
                disabled={Boolean(issue)}
                aria-label={`${existing ? "Добавлено" : "Добавить"} ${measure.id}`}
                aria-describedby={issue ? `issue-${measure.id}` : undefined}
                onClick={() =>
                  onChange({ decisions: [...scenario.decisions, candidate] })
                }
              >
                {existing ? "✓ В плане" : "+ Включить в план"}
              </button>
              {issue && (
                <p className="measure-issue" id={`issue-${measure.id}`}>
                  {issue}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="district-panel-footnote">
        Выбор районной меры действует только здесь. Для общегородских мер
        откройте «Весь город».
      </p>
    </aside>
  );
}
