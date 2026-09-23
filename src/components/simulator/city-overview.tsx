import { useState } from "react";
import { dataset } from "@/data/dataset";
import type { DistrictId, ScoreSnapshot } from "@/domain/types";
import { directions, formatNumber, heatLevel } from "./presentation";

export function CityOverview({
  baseline,
  onStart,
}: {
  baseline: ScoreSnapshot;
  onStart: () => void;
}) {
  const [activeDistrict, setActiveDistrict] = useState<DistrictId>("nura");
  const current = dataset.districts.find((d) => d.id === activeDistrict)!;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ШАГ 01 / ОБЗОР ГОРОДА</p>
          <h2>
            Большие решения
            <br />
            <span>начинаются с данных.</span>
          </h2>
          <p className="page-description">
            Изучите районы Астаны, найдите точки роста
            <br className="desktop-break" /> и составьте свою программу
            развития.
          </p>
        </div>
        <button className="button primary" onClick={onStart}>
          Выбрать решения <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="metric-grid">
        <article className="metric score-metric">
          <div className="metric-label">
            Качество городской жизни <span aria-hidden="true">↗</span>
          </div>
          <div className="metric-value">
            {formatNumber(baseline.score, 2)}
            <span>балла</span>
          </div>
          <p>Исходная оценка по датасету</p>
        </article>
        <article className="metric">
          <div className="metric-label">
            Ваш бюджет <span aria-hidden="true">◈</span>
          </div>
          <div className="metric-value">
            {dataset.rules.budget}
            <span>ед.</span>
          </div>
          <p>Единый для всех сценариев</p>
        </article>
        <article className="metric">
          <div className="metric-label">
            Районов в модели <span aria-hidden="true">▥</span>
          </div>
          <div className="metric-value">
            {dataset.districts.length}
            <span>районов</span>
          </div>
          <p>10 показателей в каждом</p>
        </article>
        <article className="metric attention-metric">
          <div className="metric-label">
            Требуют внимания <span aria-hidden="true">!</span>
          </div>
          <div className="metric-value">
            {baseline.criticalIndicators.length}
            <span>показателя</span>
          </div>
          <p>Значения ниже {dataset.rules.criticalThreshold} в Нуре</p>
        </article>
      </div>
      <section className="panel city-data" aria-labelledby="heatmap-title">
        <div className="panel-heading">
          <div>
            <h3 id="heatmap-title">Город в цифрах</h3>
            <p>Все показатели — от 0 до 100. Чем выше, тем лучше.</p>
          </div>
          <span className="quiet-badge">Исходное состояние</span>
        </div>
        <div className="desktop-heatmap">
          <table className="heatmap">
            <caption className="sr-only">
              Исходные показатели пяти районов Астаны
            </caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  Район
                </th>
                {directions.map((d) => (
                  <th scope="colgroup" colSpan={2} key={d.id}>
                    <span className={`table-direction ${d.id}`}>{d.short}</span>
                  </th>
                ))}
                <th scope="col" rowSpan={2}>
                  Оценка
                </th>
              </tr>
              <tr>
                {dataset.indicators.map((i) => (
                  <th scope="col" key={i.id}>
                    <abbr title={i.name}>{i.id}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.districts.map((d) => (
                <tr key={d.id}>
                  <th scope="row">
                    <strong>{d.name}</strong>
                    <small>
                      {formatNumber(d.populationShare * 100)}% населения
                    </small>
                  </th>
                  {dataset.indicators.map((i) => (
                    <td key={i.id}>
                      <span
                        className={`heat-cell ${heatLevel(d.indicators[i.id], dataset.rules.criticalThreshold)}`}
                        title={`${i.name}: ${d.indicators[i.id]}`}
                      >
                        <span className="sr-only">{i.name}: </span>
                        {d.indicators[i.id]}
                        {d.indicators[i.id] <
                          dataset.rules.criticalThreshold && (
                          <>
                            <sup aria-hidden="true">!</sup>
                            <span className="sr-only">
                              , критический показатель
                            </span>
                          </>
                        )}
                      </span>
                    </td>
                  ))}
                  <td className="district-score">
                    {formatNumber(
                      baseline.districts.find((s) => s.districtId === d.id)!
                        .score,
                      2,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-heatmap">
          <label htmlFor="overview-district">Показатели района</label>
          <select
            id="overview-district"
            value={activeDistrict}
            onChange={(e) => setActiveDistrict(e.target.value as DistrictId)}
          >
            {dataset.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="mobile-district-meta">
            {formatNumber(current.populationShare * 100)}% населения · оценка{" "}
            {formatNumber(
              baseline.districts.find((s) => s.districtId === current.id)!
                .score,
              2,
            )}
          </p>
          <dl className="mobile-indicators">
            {dataset.indicators.map((i) => (
              <div key={i.id}>
                <dt>
                  <span>{i.id}</span> {i.name}
                </dt>
                <dd
                  className={`heat-cell ${heatLevel(current.indicators[i.id], dataset.rules.criticalThreshold)}`}
                >
                  {current.indicators[i.id]}
                  {current.indicators[i.id] <
                    dataset.rules.criticalThreshold && (
                    <>
                      <span aria-hidden="true"> !</span>
                      <span className="sr-only">, критический показатель</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="heatmap-footer">
          <span>Состояние показателя</span>
          <div className="legend">
            <span>
              <i className="critical" /> &lt; 40 · критично
            </span>
            <span>
              <i className="low" /> 40–49
            </span>
            <span>
              <i className="medium" /> 50–64
            </span>
            <span>
              <i className="high" /> 65–100
            </span>
          </div>
        </div>
        <details className="indicator-key">
          <summary>Что означают T1, E2 и другие показатели?</summary>
          <dl>
            {dataset.indicators.map((i) => (
              <div key={i.id}>
                <dt>
                  {i.id} · {i.name}
                </dt>
                <dd>{i.description}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
      <div className="section-heading">
        <h3>У каждого района — свои приоритеты</h3>
        <span>Профили из датасета</span>
      </div>
      <div className="district-grid">
        {dataset.districts.map((d, index) => (
          <article
            className={`district-card ${d.id === "nura" ? "district-focus" : ""}`}
            key={d.id}
          >
            <div>
              <span className="district-number">0{index + 1}</span>
              {d.id === "nura" && (
                <span className="focus-badge">Особое внимание</span>
              )}
            </div>
            <h4>{d.name}</h4>
            <p>{d.profile}</p>
            <span className="district-pop">
              {formatNumber(d.populationShare * 100)}% населения города
            </span>
          </article>
        ))}
      </div>
      <section className="rules-strip" aria-labelledby="rules-title">
        <div className="rules-symbol" aria-hidden="true">
          ↗
        </div>
        <div>
          <h3 id="rules-title">Пять решений. Один общий результат.</h3>
          <p>
            Бюджет — 100 единиц, не больше двух мер одного направления, без
            повторов. Горизонт оценки — 8 кварталов.
          </p>
        </div>
        <button className="button secondary" onClick={onStart}>
          Составить план <span aria-hidden="true">→</span>
        </button>
      </section>
    </>
  );
}
