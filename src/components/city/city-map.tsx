"use client";

import { useEffect, useRef, useState } from "react";
import { dataset } from "@/data/dataset";
import type { Decision, DistrictId } from "@/domain/types";
import type { CityScene } from "./city-scene";

export function CityMap({
  selected,
  onSelect,
  decisions,
  progress,
}: {
  selected: DistrictId | null;
  onSelect: (id: DistrictId) => void;
  decisions: readonly Decision[];
  progress: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<DistrictId, HTMLButtonElement>());
  const scene = useRef<CityScene | null>(null);
  const keyboardFocus = useRef(false);
  const latest = useRef({ selected, onSelect, decisions, progress });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  useEffect(() => {
    latest.current = { selected, onSelect, decisions, progress };
    scene.current?.select(selected);
    scene.current?.progress(progress);
  }, [selected, onSelect, decisions, progress]);
  useEffect(() => {
    scene.current?.projects(decisions);
  }, [decisions]);
  useEffect(() => {
    let cancelled = false;
    import("./city-scene")
      .then(({ createCityScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = createCityScene(
            host.current,
            labels.current,
            (id) => latest.current.onSelect(id),
            () => {
              if (!cancelled) setStatus("fallback");
              scene.current?.dispose();
              scene.current = null;
            },
          );
          scene.current.select(latest.current.selected);
          scene.current.projects(latest.current.decisions);
          scene.current.progress(latest.current.progress);
          setStatus("ready");
        } catch {
          setStatus("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("fallback");
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  return (
    <div
      className={`city-map map-${status}`}
      data-testid="city-map"
      data-renderer={status}
      onPointerDownCapture={() => {
        keyboardFocus.current = false;
      }}
    >
      <div className="map-canvas" ref={host}>
        <div className="map-label-layer">
          {dataset.districts.map((d) => (
            <button
              key={d.id}
              ref={(node) => {
                if (node) labels.current.set(d.id, node);
                else labels.current.delete(d.id);
              }}
              className={`map-district-label ${selected === d.id ? "is-active" : ""}`}
              aria-label={`Выбрать район ${d.name}`}
              aria-pressed={selected === d.id}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") scene.current?.hover(d.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== "touch") scene.current?.hover(null);
              }}
              onFocus={(event) => {
                keyboardFocus.current =
                  event.currentTarget.matches(":focus-visible");
                if (keyboardFocus.current) scene.current?.hover(d.id);
              }}
              onBlur={() => {
                if (keyboardFocus.current) scene.current?.hover(null);
              }}
              onClick={() => {
                scene.current?.hover(d.id);
                onSelect(d.id);
              }}
            >
              <span className={`map-dot dot-${d.id}`} />
              {d.name}
              {decisions.some((s) => s.districtId === d.id) && (
                <i aria-label="Есть решения">•</i>
              )}
            </button>
          ))}
        </div>
      </div>
      {status === "loading" && (
        <div className="map-loading-message" role="status">
          <span />
          Собираем город…
        </div>
      )}
      {status === "fallback" && (
        <div className="map-fallback-message" role="status">
          <strong>Выберите район из списка</strong>
          <p>
            3D недоступно в этом браузере. Выбор решений продолжает работать.
          </p>
        </div>
      )}
      <div className="map-tools" aria-label="Управление картой">
        <button
          aria-label="Приблизить карту"
          disabled={status !== "ready"}
          onClick={() => scene.current?.zoom(1.2)}
        >
          +
        </button>
        <button
          aria-label="Отдалить карту"
          disabled={status !== "ready"}
          onClick={() => scene.current?.zoom(1 / 1.2)}
        >
          −
        </button>
        <button
          aria-label="Сбросить ракурс"
          disabled={status !== "ready"}
          onClick={() => scene.current?.reset()}
        >
          ↺
        </button>
      </div>
      <div className="map-caption">
        <span>Схематичная 3D-модель · границы условные</span>
        <span className="map-gesture-hint">
          Робот указывает на район · перетаскивайте для поворота
        </span>
      </div>
    </div>
  );
}
