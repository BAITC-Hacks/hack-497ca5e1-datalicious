"use client";

import { useRef, useState } from "react";
import { dataset } from "@/data/dataset";
import type { Scenario } from "@/domain/types";
import { CityOverview } from "./simulator/city-overview";
import { DecisionBuilder } from "./simulator/decision-builder";
import { baselineFixture } from "./simulator/baseline-fixture";
import { readSavedDraft } from "./simulator/selection-adapter";

const storageKey = `akim-scenario:${dataset.version}`;

export function ProjectShell() {
  const [step, setStep] = useState<"city" | "decisions">("city");
  const [scenario, setScenario] = useState<Scenario>({ decisions: [] });
  const [notice, setNotice] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const content = useRef<HTMLElement>(null);
  function navigate(next: typeof step) {
    setStep(next);
    content.current?.focus();
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(scenario));
      setNotice("План сохранён в этом браузере.");
    } catch {
      setNotice(
        "Браузер не разрешил сохранение. Текущий план остаётся на экране.",
      );
    }
  }
  function restore() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        setNotice(
          "Сохранённого плана пока нет. Выберите меры и нажмите «Сохранить».",
        );
        return;
      }
      const next = readSavedDraft(JSON.parse(saved));
      if (!next) {
        setNotice(
          "Сохранённый план не соответствует правилам. Текущий выбор не изменён.",
        );
        return;
      }
      setScenario(next);
      setDraftVersion((v) => v + 1);
      setNotice("Сохранённый план восстановлен.");
      navigate("decisions");
    } catch {
      setNotice(
        "Не удалось прочитать сохранённый план. Текущий выбор не изменён.",
      );
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <aside className="app-sidebar">
        <a
          className="brand"
          href="#main-content"
          onClick={() => navigate("city")}
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <h1>Аким на 5 часов</h1>
            <span>СИМУЛЯТОР ГОРОДА</span>
          </div>
        </a>
        <div className="workspace-label">ВАШ ГОРОД</div>
        <nav className="main-nav" aria-label="Этапы симулятора">
          <button
            className={step === "city" ? "active" : ""}
            aria-current={step === "city" ? "step" : undefined}
            onClick={() => navigate("city")}
          >
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>
            <span>Состояние города</span>
            <small>01</small>
          </button>
          <button
            className={step === "decisions" ? "active" : ""}
            aria-current={step === "decisions" ? "step" : undefined}
            onClick={() => navigate("decisions")}
          >
            <span className="nav-icon" aria-hidden="true">
              ☷
            </span>
            <span>Ваши решения</span>
            <small>{scenario.decisions.length}/5</small>
          </button>
          <span className="future-step" aria-disabled="true">
            <span className="nav-icon" aria-hidden="true">
              ↗
            </span>
            <span>Результат</span>
            <small>скоро</small>
          </span>
        </nav>
        <div className="sidebar-bottom">
          <div className="city-illustration" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p>
            Астана начинается
            <br />с ваших решений.
          </p>
          <span className="sidebar-caption">Учебная модель · 5 районов</span>
          <button
            className="sidebar-rules"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            aria-controls="rules-panel"
          >
            <span aria-hidden="true">ⓘ</span> Правила симуляции
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Симулятор <span>/</span> <strong>Астана</strong>
            <span className="live-dot" aria-hidden="true" />
          </div>
          <div className="topbar-actions">
            <button className="text-button restore-button" onClick={restore}>
              Восстановить
            </button>
            <button className="button save-button" onClick={save}>
              <span aria-hidden="true">↓</span> Сохранить план
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className="main-content"
          tabIndex={-1}
          ref={content}
        >
          {notice && (
            <div className="notice" role="status">
              <p>{notice}</p>
              <button
                aria-label="Закрыть уведомление"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {showRules && (
            <section
              className="rules-panel panel"
              id="rules-panel"
              aria-labelledby="rules-heading"
            >
              <div className="panel-heading">
                <h2 id="rules-heading">Правила симуляции</h2>
                <button
                  className="text-button"
                  onClick={() => setShowRules(false)}
                >
                  Закрыть
                </button>
              </div>
              <ul>
                <li>
                  Ровно 5 разных мероприятий, общая стоимость не выше 100
                  единиц.
                </li>
                <li>
                  Не больше 2 мероприятий одного направления; покрывать все
                  направления необязательно.
                </li>
                <li>
                  Для районной меры выберите район. Городская действует везде и
                  оплачивается один раз.
                </li>
                <li>
                  M1 и M3 несовместимы в любых районах. M4 и M7, а также M5 и
                  M13 — в одном районе.
                </li>
                <li>
                  Синергии M1 + M2, M10 + M12 и M5 + M6 дают дополнительный
                  бонус.
                </li>
                <li>
                  Эффекты оцениваются за 8 кварталов с учётом лага. Критические
                  показатели — строго ниже 40.
                </li>
              </ul>
            </section>
          )}
          {step === "city" ? (
            <CityOverview
              baseline={baselineFixture}
              onStart={() => navigate("decisions")}
            />
          ) : (
            <DecisionBuilder
              key={draftVersion}
              scenario={scenario}
              onChange={setScenario}
            />
          )}
          <footer className="page-footer">
            <span>
              Аким на 5 часов <span aria-hidden="true">·</span> Datalicious
            </span>
            <span>Синтетические данные · Учебная симуляция</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
