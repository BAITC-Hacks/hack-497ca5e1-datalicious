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
      aria-labelledby="construction-title"
      role="region"
    >
      <div className="construction-title">
        <h2 id="construction-title">Демонстрация плана</h2>
        <span>{index + 1} / 5</span>
      </div>
      <div
        className="construction-current"
        aria-live="polite"
        aria-atomic="true"
      >
        <p>
          {measure?.name}
          <small>{district?.name ?? "Весь город"}</small>
        </p>
      </div>
      <progress aria-label="Ход демонстрации" max={5} value={progress * 5} />
      <div className="construction-bottom">
        <span>Показ на карте · 10 с</span>
        <button onClick={onComplete}>Пропустить анимацию →</button>
      </div>
    </section>
  );
}
