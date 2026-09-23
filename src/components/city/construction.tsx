import { useEffect, useState } from "react";
import { dataset } from "@/data/dataset";
import type { Scenario } from "@/domain/types";

export const CONSTRUCTION_DURATION_MS = 10_000;

/** Visual timeline only. It never computes, changes or delays a domain result. */
export function Construction({
  scenario,
  onProgress,
  onComplete,
}: {
  scenario: Scenario;
  onProgress: (p: number) => void;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const value = Math.min(
        1,
        (Date.now() - start) / CONSTRUCTION_DURATION_MS,
      );
      setProgress(value);
      onProgress(value);
      if (value === 1) onComplete();
    };
    const timer = window.setInterval(tick, 80);
    return () => window.clearInterval(timer);
  }, [onProgress, onComplete]);
  const index = Math.min(4, Math.floor(progress * 5));
  const decision = scenario.decisions[index];
  const measure = dataset.measures.find((m) => m.id === decision?.measureId);
  const district = dataset.districts.find((d) => d.id === decision?.districtId);
  return (
    <section
      className="construction-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="construction-title"
    >
      <p className="construction-kicker">ВАШ ПЛАН ПРЕОБРАЖАЕТ ГОРОД</p>
      <div className="construction-title">
        <h2 id="construction-title">Работы идут</h2>
        <strong>
          {Math.min(100, Math.round(progress * 100))}
          <span>%</span>
        </strong>
      </div>
      <progress
        aria-label="Визуализация выполнения работ"
        max={100}
        value={progress * 100}
      />
      <div
        className="construction-current"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>0{index + 1} / 05</span>
        <p>
          {measure?.name}
          <small>{district?.name ?? "Весь город"}</small>
        </p>
      </div>
      <div className="construction-bottom">
        <span>Условная анимация · 10 секунд</span>
        <button autoFocus onClick={onComplete}>
          Пропустить анимацию →
        </button>
      </div>
    </section>
  );
}
