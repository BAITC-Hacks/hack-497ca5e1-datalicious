import { useState } from "react";
import { dataset } from "@/data/dataset";
import type {
  Decision,
  Direction,
  DistrictId,
  Measure,
  Scenario,
} from "@/domain/types";
import { directions, formatEffects } from "./presentation";
import {
  draftIssues,
  selectionAdapter,
  selectionCost,
} from "./selection-adapter";

const measures: readonly Measure[] = dataset.measures;

export function BudgetMeter({
  spent,
  limit,
}: {
  spent: number;
  limit: number;
}) {
  return (
    <div className="budget-meter">
      <div>
        <span>Использовано</span>
        <strong>
          {spent}
          <small> / {limit} ед.</small>
        </strong>
      </div>
      <progress
        aria-label="Использованный бюджет"
        max={limit}
        value={Math.min(spent, limit)}
      />
      <p className={spent > limit ? "budget-error" : ""}>
        {spent > limit
          ? `Превышение на ${spent - limit} ед.`
          : `Осталось ${limit - spent} ед.`}
      </p>
    </div>
  );
}

function makeDecision(
  measure: Measure,
  districtId: DistrictId | "",
): Decision | null {
  if (measure.scope === "city") return { measureId: measure.id };
  return districtId ? { measureId: measure.id, districtId } : null;
}

export function DecisionBuilder({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
}) {
  const [filter, setFilter] = useState<Direction | "all">("all");
  const [districts, setDistricts] = useState<
    Partial<Record<string, DistrictId>>
  >(() =>
    Object.fromEntries(
      scenario.decisions
        .filter((d) => d.districtId)
        .map((d) => [d.measureId, d.districtId]),
    ),
  );
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const selected = scenario.decisions;
  const spent = selectionCost(selected);
  const validation = selectionAdapter.validate(scenario);
  const visible = measures.filter(
    (m) => filter === "all" || m.direction === filter,
  );
  const activeSynergies = dataset.synergies.filter((s) =>
    s.pair.every((id) => selected.some((d) => d.measureId === id)),
  );

  function update(next: readonly Decision[], notification: string) {
    onChange({ decisions: next });
    setReviewed(false);
    setMessage(notification);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ШАГ 02 / ПРОГРАММА РАЗВИТИЯ</p>
          <h2>
            Каким станет город?
            <br />
            <span>Решать вам.</span>
          </h2>
          <p className="page-description">
            Выберите пять мероприятий. Учитывайте бюджет,
            <br className="desktop-break" /> потребности районов и совместимость
            решений.
          </p>
        </div>
        <div className="selection-count">
          <strong>
            {selected.length}
            <span> / {dataset.rules.requiredDecisions}</span>
          </strong>
          <small>решений в вашем плане</small>
        </div>
      </div>
      <div className="builder-layout">
        <section className="catalog" aria-labelledby="catalog-title">
          <div className="section-heading">
            <h3 id="catalog-title">
              Каталог мероприятий{" "}
              <span className="count-badge">{dataset.measures.length}</span>
            </h3>
          </div>
          <div
            className="filters"
            role="group"
            aria-label="Фильтр по направлению"
          >
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Все направления
            </button>
            {directions.map((d) => (
              <button
                key={d.id}
                aria-pressed={filter === d.id}
                onClick={() => setFilter(d.id)}
              >
                {d.short}
              </button>
            ))}
          </div>
          <p className="catalog-note">
            Показаны полные эффекты до учёта лага.{" "}
            <span>Лаг — задержка начала действия меры.</span>
          </p>
          <div className="measure-grid">
            {visible.map((measure) => {
              const direction = directions.find(
                (d) => d.id === measure.direction,
              )!;
              const existing = selected.find((d) => d.measureId === measure.id);
              const districtId =
                existing?.districtId ?? districts[measure.id] ?? "";
              const candidate = makeDecision(measure, districtId);
              const issue = existing
                ? "Уже добавлено в ваш план"
                : selected.length >= dataset.rules.requiredDecisions
                  ? "Все пять слотов заняты. Удалите одну меру для замены."
                  : !candidate
                    ? "Сначала выберите район"
                    : draftIssues({ decisions: [...selected, candidate] })[0]
                        ?.message;
              const synergies = dataset.synergies.filter((s) =>
                s.pair.some((id) => id === measure.id),
              );
              return (
                <article
                  className={`measure-card ${existing ? "is-selected" : ""}`}
                  key={measure.id}
                  aria-labelledby={`title-${measure.id}`}
                >
                  <div className="measure-top">
                    <span className={`direction-tag ${measure.direction}`}>
                      <span aria-hidden="true">{direction.symbol}</span>
                      {direction.short}
                    </span>
                    <span className="measure-id">{measure.id}</span>
                  </div>
                  <h4 id={`title-${measure.id}`}>{measure.name}</h4>
                  <div className="measure-meta">
                    <span>
                      {measure.scope === "city" ? "Весь город" : "Один район"}
                    </span>
                    <span>Лаг: {measure.lagQuarters} кв.</span>
                    <strong>
                      {measure.cost} <small>ед.</small>
                    </strong>
                  </div>
                  <div className="effects" aria-label="Полные эффекты">
                    {Object.entries(measure.effects).map(([id, value]) => (
                      <span
                        key={id}
                        className={value < 0 ? "negative" : ""}
                        title={
                          dataset.indicators.find((i) => i.id === id)?.name
                        }
                      >
                        {id}{" "}
                        <b>
                          {value > 0 ? "+" : ""}
                          {value}
                        </b>
                        <span className="sr-only">
                          {" "}
                          — {dataset.indicators.find((i) => i.id === id)?.name}
                        </span>
                      </span>
                    ))}
                  </div>
                  {synergies.length > 0 && (
                    <div className="measure-synergies">
                      {synergies.map((s) => {
                        const other = s.pair.find((id) => id !== measure.id)!;
                        const active = selected.some(
                          (d) => d.measureId === other,
                        );
                        return (
                          <p key={other} className={active ? "available" : ""}>
                            <span aria-hidden="true">⌁</span>{" "}
                            {active ? "Синергия доступна" : "Синергия"} с{" "}
                            {other}: {formatEffects(s.effects)}
                            <span className="sr-only">
                              {" "}
                              в районе {s.pair[0]}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                  <div className="measure-actions">
                    {measure.scope === "district" ? (
                      <>
                        <label
                          className="sr-only"
                          htmlFor={`district-${measure.id}`}
                        >
                          Район для {measure.id}
                        </label>
                        <select
                          id={`district-${measure.id}`}
                          value={districtId}
                          disabled={Boolean(existing)}
                          onChange={(e) =>
                            setDistricts((prev) => ({
                              ...prev,
                              [measure.id]: e.target.value as DistrictId,
                            }))
                          }
                        >
                          <option value="">Выберите район</option>
                          {dataset.districts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <div className="city-scope">
                        Действует во всех 5 районах
                      </div>
                    )}
                    <button
                      className={`button ${existing ? "selected-button" : "add-button"}`}
                      disabled={Boolean(issue)}
                      aria-label={`${existing ? "Добавлено" : "Добавить"} ${measure.id}`}
                      aria-describedby={
                        issue ? `hint-${measure.id}` : undefined
                      }
                      onClick={() => {
                        if (candidate && !issue)
                          update(
                            [...selected, candidate],
                            `${measure.name} добавлено в план.`,
                          );
                      }}
                    >
                      {existing ? "✓ В плане" : "+ Добавить"}
                    </button>
                  </div>
                  {issue && (
                    <p
                      id={`hint-${measure.id}`}
                      className={`selection-hint ${existing ? "" : candidate ? "constraint-hint" : ""}`}
                    >
                      {issue}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <p className="catalog-footnote">
            Городская мера оплачивается один раз. Районная мера действует только
            в выбранном районе.
          </p>
        </section>
        <aside className="plan-sidebar" aria-labelledby="plan-title">
          <div className="plan-top">
            <span className="eyebrow">ВАШ СЦЕНАРИЙ</span>
            <h3 id="plan-title">План развития</h3>
            <p>Ровно 5 мер · бюджет до 100 ед.</p>
          </div>
          <BudgetMeter spent={spent} limit={dataset.rules.budget} />
          <ol className="decision-slots" aria-label="Пять слотов решений">
            {Array.from(
              { length: dataset.rules.requiredDecisions },
              (_, index) => {
                const decision = selected[index];
                if (!decision)
                  return (
                    <li className="empty-slot" key={`empty-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>Добавьте мероприятие</p>
                      <span aria-hidden="true">+</span>
                    </li>
                  );
                const measure = measures.find(
                  (m) => m.id === decision.measureId,
                )!;
                return (
                  <li className="filled-slot" key={decision.measureId}>
                    <span className={`slot-marker ${measure.direction}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{measure.name}</strong>
                      <small>
                        {decision.districtId
                          ? dataset.districts.find(
                              (d) => d.id === decision.districtId,
                            )?.name
                          : "Весь город"}{" "}
                        · {measure.cost} ед.
                      </small>
                    </div>
                    <button
                      aria-label={`Удалить ${decision.measureId}`}
                      className="remove-button"
                      onClick={() =>
                        update(
                          selected.filter(
                            (d) => d.measureId !== decision.measureId,
                          ),
                          `${measure.id} удалено из плана.`,
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                );
              },
            )}
          </ol>
          <div className="direction-counts">
            <h4>
              Баланс направлений <span>макс. 2</span>
            </h4>
            {directions.map((d) => {
              const count = selected.filter(
                (s) =>
                  measures.find((m) => m.id === s.measureId)?.direction ===
                  d.id,
              ).length;
              return (
                <div key={d.id}>
                  <span>
                    <i className={`direction-dot ${d.id}`} />
                    {d.short}
                  </span>
                  <span
                    className="count-dots"
                    aria-label={`${d.label}: ${count} из 2`}
                  >
                    <i className={count >= 1 ? "filled" : ""} />
                    <i className={count >= 2 ? "filled" : ""} />
                    <small>{count}/2</small>
                  </span>
                </div>
              );
            })}
          </div>
          {activeSynergies.length > 0 && (
            <div className="active-synergies">
              <h4>⌁ Синергии в вашем плане</h4>
              {activeSynergies.map((s) => (
                <p key={s.pair.join()}>
                  {s.pair.join(" + ")}
                  <strong>{formatEffects(s.effects)}</strong>
                  <small>
                    {
                      dataset.districts.find(
                        (d) =>
                          d.id ===
                          selected.find((item) => item.measureId === s.pair[0])
                            ?.districtId,
                      )?.name
                    }{" "}
                    · бонус без лага
                  </small>
                </p>
              ))}
            </div>
          )}
          <div className="plan-bottom">
            {!validation.valid && (
              <p className="plan-guidance">
                {selected.length < dataset.rules.requiredDecisions
                  ? `Выбрано ${selected.length} из ${dataset.rules.requiredDecisions}. Заполните оставшиеся слоты.`
                  : validation.issues[0]?.message}
              </p>
            )}
            <button
              className="button primary"
              disabled={!validation.valid}
              onClick={() => {
                setReviewed(true);
                setMessage(
                  "Сценарий проверен: пять решений, бюджет и ограничения соблюдены.",
                );
              }}
            >
              Проверить сценарий <span aria-hidden="true">→</span>
            </button>
            {reviewed && validation.valid && (
              <div className="review-success" role="status">
                <strong>✓ План готов</strong>
                <p>
                  Пять решений, бюджет и ограничения соблюдены. Расчёт итогового
                  результата появится на следующем этапе.
                </p>
              </div>
            )}
            {selected.length > 0 && (
              <button
                className="text-button reset-plan"
                onClick={() => update([], "План очищен.")}
              >
                Очистить план
              </button>
            )}
          </div>
        </aside>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}
