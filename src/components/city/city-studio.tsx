"use client";

import { useCallback, useRef, useState } from "react";
import { dataset } from "@/data/dataset";
import type { Scenario } from "@/domain/types";
import { baselineFixture } from "../simulator/baseline-fixture";
import {
  readSavedDraft,
  selectionAdapter,
  selectionCost,
} from "../simulator/selection-adapter";
import { formatNumber, formatEffects } from "../simulator/presentation";
import { CityMap } from "./city-map";
import { geography, type MapDistrictId } from "./geography";
import { DistrictPanel } from "./district-panel";
import { Construction } from "./construction";

const storageKey = `akim-scenario:${dataset.version}`;

export function CityStudio() {
  const [target, setTarget] = useState<MapDistrictId | "city" | null>(null);
  const [scenario, setScenario] = useState<Scenario>({ decisions: [] });
  const [notice, setNotice] = useState("");
  const [rules, setRules] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [phase, setPhase] = useState<"planning" | "running" | "complete">(
    "planning",
  );
  const [progress, setProgress] = useState(0);
  const launchButton = useRef<HTMLButtonElement>(null);
  const spent = selectionCost(scenario.decisions);
  const validation = selectionAdapter.validate(scenario);
  const selectDistrict = useCallback(
    (id: MapDistrictId) => {
      if (phase !== "running") setTarget(id);
    },
    [phase],
  );
  const finish = useCallback(() => {
    setProgress(1);
    setPhase("complete");
  }, []);
  const activeSynergies = dataset.synergies.filter((s) =>
    s.pair.every((id) => scenario.decisions.some((d) => d.measureId === id)),
  );
  function change(next: Scenario) {
    if (phase === "running") return;
    setScenario(next);
    setPhase("planning");
    setProgress(0);
    setNotice("");
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(scenario));
      setNotice("План сохранён в этом браузере.");
    } catch {
      setNotice("Сохранение недоступно. План остаётся на экране.");
    }
  }
  function restore() {
    try {
      const text = localStorage.getItem(storageKey);
      if (!text) {
        setNotice("Сохранённого плана пока нет.");
        return;
      }
      const next = readSavedDraft(JSON.parse(text));
      if (!next) {
        setNotice(
          "Сохранённый план не соответствует правилам. Текущий выбор не изменён.",
        );
        return;
      }
      change(next);
      setNotice("План восстановлен.");
    } catch {
      setNotice("Не удалось прочитать сохранённый план.");
    }
  }
  function launch() {
    if (!validation.valid || phase === "running") return;
    setTarget(null);
    setPlanOpen(false);
    setRules(false);
    setProgress(0);
    setPhase("running");
  }
  function closeComplete() {
    setPhase("planning");
    requestAnimationFrame(() => launchButton.current?.focus());
  }
  return (
    <div className={`city-studio ${target ? "has-panel" : ""} phase-${phase}`}>
      <div className="studio-content">
        <a href="#district-picker" className="skip-link">
          Перейти к выбору района
        </a>
        <header className="studio-header" inert={phase === "running"}>
          <a
            href="#district-picker"
            className="studio-brand"
            onClick={() => setTarget(null)}
          >
            <span className="studio-brand-icon" aria-hidden="true">
              а
            </span>
            <h1>
              Аким <span>на 5 часов</span>
            </h1>
          </a>
          <div className="studio-header-location">
            Астана <span>Городская лаборатория</span>
          </div>
          <nav aria-label="Действия со сценарием">
            <button onClick={() => setRules((v) => !v)} aria-expanded={rules}>
              Правила
            </button>
            <button onClick={restore}>Восстановить</button>
            <button className="studio-save" onClick={save}>
              Сохранить
            </button>
          </nav>
        </header>
        <main className="studio-main">
          <div className="map-workspace">
            <div className="map-intro">
              <p>ИНТЕРАКТИВНЫЙ МАКЕТ</p>
              <h2>Астана</h2>
              <span>Выберите район</span>
            </div>
            <div className="map-budget">
              <span>Осталось</span>
              <strong>
                {100 - spent}
                <small> / 100 ед.</small>
              </strong>
              <progress
                aria-label="Использованный бюджет"
                value={spent}
                max={100}
              />
            </div>
            <CityMap
              selected={target === "city" ? null : target}
              onSelect={selectDistrict}
              decisions={scenario.decisions}
              progress={progress}
            />
            <div
              inert={phase === "running"}
              className="district-picker"
              id="district-picker"
              tabIndex={-1}
              role="group"
              aria-label="Районы и общегородские меры"
            >
              {geography.districts.map((d) => (
                <button
                  key={d.id}
                  aria-pressed={target === d.id}
                  onClick={() => setTarget(d.id)}
                >
                  {d.name}
                </button>
              ))}
              <span />
              <button
                aria-pressed={target === "city"}
                onClick={() => setTarget("city")}
              >
                Весь город ↗
              </button>
            </div>
          </div>
          {target && (
            <DistrictPanel
              key={target}
              target={target}
              scenario={scenario}
              onChange={change}
              onClose={() => setTarget(null)}
            />
          )}
        </main>
        <footer className="plan-dock" inert={phase === "running"}>
          <div className="plan-dock-heading">
            <button
              onClick={() => setPlanOpen((v) => !v)}
              aria-expanded={planOpen}
              aria-controls="plan-review"
            >
              Ваш план <strong>{scenario.decisions.length}/5</strong>
              <span>{planOpen ? "⌄" : "⌃"}</span>
            </button>
            <small>До 2 мер одного направления</small>
          </div>
          <ol className="plan-dock-slots" aria-label="Пять решений">
            {Array.from({ length: 5 }, (_, i) => {
              const d = scenario.decisions[i];
              const m = dataset.measures.find((m) => m.id === d?.measureId);
              return (
                <li key={d?.measureId ?? i} className={d ? "filled" : ""}>
                  <span className="dock-index">0{i + 1}</span>
                  {d && m ? (
                    <>
                      <button
                        className="dock-decision"
                        onClick={() => setTarget(d.districtId ?? "city")}
                      >
                        <strong>{m.name}</strong>
                        <small>
                          {d.districtId
                            ? dataset.districts.find(
                                (r) => r.id === d.districtId,
                              )?.name
                            : "Весь город"}{" "}
                          · {m.cost} ед.
                        </small>
                      </button>
                      <button
                        className="dock-remove"
                        aria-label={`Удалить ${d.measureId}`}
                        onClick={() =>
                          change({
                            decisions: scenario.decisions.filter(
                              (s) => s.measureId !== d.measureId,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="dock-empty">Выберите меру</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="dock-launch">
            <button
              ref={launchButton}
              disabled={!validation.valid}
              onClick={launch}
            >
              Запустить план <span>→</span>
            </button>
            <small>
              {validation.valid
                ? "Демонстрация · 10 секунд"
                : `Выберите ещё ${5 - scenario.decisions.length} меропр.`}
            </small>
          </div>
        </footer>
        {planOpen && (
          <section
            className="plan-review"
            id="plan-review"
            aria-labelledby="plan-review-title"
          >
            <div className="review-header">
              <h2 id="plan-review-title">Ваши решения</h2>
              <button
                aria-label="Закрыть план"
                onClick={() => setPlanOpen(false)}
              >
                ×
              </button>
            </div>
            {scenario.decisions.length === 0 ? (
              <p>План пока пуст. Выберите район и добавьте мероприятие.</p>
            ) : (
              <ol>
                {scenario.decisions.map((d) => {
                  const m = dataset.measures.find((m) => m.id === d.measureId)!;
                  return (
                    <li key={d.measureId}>
                      <div>
                        <strong>{m.name}</strong>
                        <span>
                          {d.districtId
                            ? dataset.districts.find(
                                (r) => r.id === d.districtId,
                              )?.name
                            : "Весь город"}{" "}
                          · {m.cost} ед.
                        </span>
                      </div>
                      <button
                        aria-label={`Убрать ${d.measureId} из плана`}
                        onClick={() =>
                          change({
                            decisions: scenario.decisions.filter(
                              (s) => s.measureId !== d.measureId,
                            ),
                          })
                        }
                      >
                        Убрать
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="review-budget">
              Бюджет<strong>{spent} / 100</strong>
            </div>
            {activeSynergies.map((s) => (
              <p className="review-synergy" key={s.pair.join()}>
                Синергия {s.pair.join(" + ")}: {formatEffects(s.effects)}
              </p>
            ))}
            {scenario.decisions.length > 0 && (
              <button
                className="clear-plan"
                onClick={() => change({ decisions: [] })}
              >
                Очистить план
              </button>
            )}
          </section>
        )}
        {rules && (
          <section
            className="studio-rules"
            aria-labelledby="studio-rules-title"
          >
            <div className="review-header">
              <h2 id="studio-rules-title">Как устроен город</h2>
              <button
                aria-label="Закрыть правила"
                onClick={() => setRules(false)}
              >
                ×
              </button>
            </div>
            <p>
              У вас 100 единиц бюджета и ровно 5 решений. Каждую меру можно
              выбрать один раз, не больше двух из одного направления.
            </p>
            <p>
              Нажмите на район, изучите его потребности и выберите меры.
              Общегородские инициативы доступны в разделе «Весь город».
            </p>
            <p>
              Модель оценивает эффекты на горизонте 8 кварталов. Показатели ниже
              40 считаются критическими.
            </p>
            <p>
              M1 и M3 нельзя совмещать. M4 и M7, а также M5 и M13 нельзя
              выбирать в одном районе.
            </p>
            <p>
              Исходная оценка города:{" "}
              <strong>{formatNumber(baselineFixture.score, 2)}</strong>. Данные
              синтетические, карта условная.
            </p>
            <p>
              Десятисекундная анимация показывает выбранные работы. Она не
              является расчётом их эффективности.
            </p>
          </section>
        )}
        {notice && (
          <div className="studio-notice" role="status">
            <span>{notice}</span>
            <button
              aria-label="Закрыть уведомление"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {phase === "running" && (
        <div className="construction-overlay">
          <Construction
            scenario={scenario}
            onProgress={setProgress}
            onComplete={finish}
          />
        </div>
      )}
      {phase === "complete" && (
        <div className="construction-overlay">
          <section
            className="completion-card"
            role="status"
            aria-label="Демонстрация завершена"
          >
            <div>
              <strong>Демонстрация завершена</strong>
              <p>План: {spent} / 100. Реальные работы не запускались.</p>
            </div>
            <button autoFocus onClick={closeComplete}>
              Вернуться к городу →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
