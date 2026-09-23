"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { simulationEngine } from "@/domain";
import type { AnalyzeRequest, AiAnalysis, Scenario, SimulationResult } from "@/domain/types";

// Only presentation fields are read here. Scores stay in the domain result; the
// server validates its complete response. This also handles non-JSON proxy errors.
const explanationResponse = z.object({
  ok: z.literal(true),
  source: z.enum(["agent", "local"]),
  result: z.object({ scenario: z.unknown() }),
  analysis: z.object({
    summary: z.string().min(1),
    strengths: z.array(z.string()),
    risks: z.array(z.string()),
    consequences: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
});

type Mode = NonNullable<AnalyzeRequest["mode"]>;
type AnalysisState =
  | { status: "idle" }
  | { status: "loading"; mode: Mode }
  | { status: "error"; message: string }
  | { status: "success"; source: Mode; analysis: AiAnalysis };

function errorMessage(status: number) {
  if (status === 503)
    return "AI не настроен на сервере: нужны ключ и модель. Можно отдельно получить локальное объяснение без AI.";
  if (status === 502)
    return "AI-агент временно недоступен или не завершил поиск. Можно отдельно получить локальное объяснение без AI.";
  if (status === 400 || status === 422)
    return "Сервер отклонил сценарий. Проверьте решения и повторите расчёт; объяснение не создано.";
  return "Ошибка сервера. Результат расчёта сохранён. Попробуйте запросить объяснение ещё раз.";
}

/** A new scenario remounts the request state and aborts/invalidates the old request. */
export function ScenarioAnalysis({ result }: { result: SimulationResult }) {
  return <AnalysisRequest key={JSON.stringify(result.scenario)} scenario={result.scenario} />;
}

function AnalysisRequest({ scenario }: { scenario: Scenario }) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const active = useRef<AbortController | null>(null);
  const deadline = useRef<number | null>(null);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
    if (deadline.current !== null) window.clearTimeout(deadline.current);
  }, []);

  async function request(mode: Mode) {
    // Ref changes synchronously, before React renders disabled buttons.
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "loading", mode });
    const timeout = window.setTimeout(() => controller.abort(), 65_000);
    deadline.current = timeout;
    const current = () => active.current === controller;
    try {
      const body: AnalyzeRequest = { scenario, mode };
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!current()) return;
      if (!response.ok) {
        setState({ status: "error", message: errorMessage(response.status) });
        return;
      }
      const parsed = explanationResponse.safeParse(await response.json());
      if (!current()) return;
      if (!parsed.success || parsed.data.source !== mode) {
        setState({ status: "error", message: "Сервер вернул некорректное объяснение. Результат расчёта сохранён." });
        return;
      }
      const verified = simulationEngine.validate(parsed.data.result.scenario);
      if (!verified.valid || JSON.stringify(verified.scenario) !== JSON.stringify(scenario)) {
        setState({ status: "error", message: "Ответ относится к другому сценарию и не показан. Повторите запрос." });
        return;
      }
      setState({ status: "success", source: parsed.data.source, analysis: parsed.data.analysis });
    } catch {
      if (current()) {
        setState({
          status: "error",
          message: controller.signal.aborted
            ? "Время ожидания объяснения истекло. Результат расчёта сохранён."
            : "Не удалось получить объяснение: проверьте соединение и повторите запрос. Результат расчёта сохранён.",
        });
      }
    } finally {
      window.clearTimeout(timeout);
      if (current()) {
        active.current = null;
        deadline.current = null;
      }
    }
  }

  const pending = state.status === "loading";
  return (
    <section className="scenario-analysis" aria-labelledby="analysis-title">
      <h3 id="analysis-title">Объяснение и поиск альтернативы</h3>
      <p>
        Локальное объяснение доступно бесплатно, без ключа. AI-агент запускается
        отдельно: ищет варианты и проверяет их настоящим движком. Вызов OpenAI может быть платным.
      </p>
      <div className="analysis-actions">
        <button onClick={() => void request("local")} disabled={pending}>
          Получить локальное объяснение
        </button>
        <button onClick={() => void request("agent")} disabled={pending}>
          Запустить AI-агента
        </button>
      </div>
      <div aria-busy={pending} aria-live="polite">
        {state.status === "idle" && <p className="analysis-hint">Выберите способ объяснения. Автоматических запросов нет.</p>}
        {state.status === "loading" && (
          <div role="status" className="analysis-loading">
            <p>{state.mode === "agent" ? "AI-агент проверяет варианты…" : "Сервер готовит локальное объяснение…"}</p>
            <div className="analysis-skeleton" aria-hidden="true"><span /><span /><span /></div>
          </div>
        )}
        {state.status === "error" && <p className="analysis-error" role="alert">{state.message}</p>}
        {state.status === "success" && (
          <article className="analysis-success" aria-labelledby="analysis-source-title">
            <h4 id="analysis-source-title">{state.source === "local" ? "Локальное объяснение — без AI" : "AI-агент: поиск альтернативы"}</h4>
            <p>{state.analysis.summary}</p>
            {([
              ["strengths", "Сильные стороны исходного плана"],
              ["risks", "Риски исходного плана"],
              ["consequences", "Последствия и компромиссы"],
              ["recommendations", state.source === "agent" ? "Проверенная альтернатива и рекомендации" : "Локальные рекомендации"],
            ] as const).map(([field, title]) => (
              <section key={field}>
                <h4>{title}</h4>
                {state.analysis[field].length > 0 ? (
                  <ul>{state.analysis[field].map((text, index) => <li key={index}>{text}</li>)}</ul>
                ) : <p>Отдельные замечания не указаны.</p>}
              </section>
            ))}
            <p className="analysis-hint">
              {state.source === "agent"
                ? "Рекомендация не заменяет ваш план. При желании перенесите предложенные меры вручную и пересчитайте сценарий. Поиск не гарантирует глобальный максимум."
                : "Это объяснение по правилам и рассчитанным данным, а не поиск AI-агента."}
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
