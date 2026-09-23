import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dataset, exampleDecisions } from "@/data/dataset";
import { simulationEngine } from "@/domain";
import type { AnalyzeResponse, SimulationResult } from "@/domain/types";
import { ScenarioAnalysis } from "./scenario-analysis";

const evaluated = simulationEngine.evaluate({ decisions: exampleDecisions });
if (!evaluated.ok) throw new Error("Organizer fixture must remain valid");
const result = evaluated.result;
const changed = simulationEngine.evaluate({ decisions: exampleDecisions.map((decision) => decision.measureId === "M5" ? { ...decision, districtId: "esil" } : decision) });
if (!changed.ok) throw new Error("Alternative fixture must remain valid");
const otherResult = changed.result;

function success(source: "local" | "agent", summary = "Проверенные факты исходного плана.", original: SimulationResult = result) {
  const response: AnalyzeResponse = {
    ok: true,
    result: original,
    source,
    analysis: {
      summary,
      strengths: ["Улучшение доступности социальной инфраструктуры."],
      risks: ["Ресурсы ограничены."],
      consequences: ["Изменения проявятся с учётом лага."],
      recommendations: ["Предложенный набор не применяется автоматически."],
    },
  };
  return new Response(JSON.stringify(response), { status: 200 });
}

let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  request = vi.fn().mockRejectedValue(new Error("Unexpected request"));
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("makes no request on render or scenario change; sends only explicit mode and decisions", async () => {
  const { rerender } = render(<ScenarioAnalysis result={result} />);
  rerender(<ScenarioAnalysis result={result} />);
  rerender(<ScenarioAnalysis result={otherResult} />);
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(success("local", "Локальные факты.", otherResult));
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  expect(await screen.findByRole("heading", { name: "Локальное объяснение — без AI" })).toBeVisible();
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe("/api/analyze");
  expect(JSON.parse(options.body)).toEqual({ scenario: otherResult.scenario, mode: "local" });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(screen.getByText("Локальные факты.")).toBeVisible();
});

it("labels an agent reply, renders all sections as safe text and never applies its recommendations", async () => {
  request.mockResolvedValue(success("agent", "<img src=x onerror=alert(1)>"));
  const before = structuredClone(result);
  render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Запустить AI-агента" }));
  expect(await screen.findByRole("heading", { name: "AI-агент: поиск альтернативы" })).toBeVisible();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByRole("heading", { name: "Последствия и компромиссы" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Проверенная альтернатива и рекомендации" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Применить/ })).not.toBeInTheDocument();
  expect(result).toEqual(before);
  expect(JSON.parse(request.mock.calls[0]![1].body).mode).toBe("agent");
});

it.each([
  [503, "AI не настроен на сервере"],
  [502, "AI-агент временно недоступен"],
  [500, "Ошибка сервера"],
  [422, "Сервер отклонил сценарий"],
  [400, "Сервер отклонил сценарий"],
])("handles HTTP %s without silently switching modes", async (status, text) => {
  request.mockResolvedValue(new Response("private provider details", { status }));
  render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Запустить AI-агента" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(text);
  expect(screen.queryByText("private provider details")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Локальное объяснение — без AI" })).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Получить локальное объяснение" })).toBeEnabled();
});

it("lets the user explicitly request successful local explanation after missing AI settings", async () => {
  request.mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(success("local"));
  render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Запустить AI-агента" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  expect(await screen.findByRole("heading", { name: "Локальное объяснение — без AI" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(request.mock.calls.map((call) => JSON.parse(call[1].body).mode)).toEqual(["agent", "local"]);
});

it("prevents duplicate requests and provides a loading skeleton", async () => {
  let resolve!: (response: Response) => void;
  request.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
  render(<ScenarioAnalysis result={result} />);
  const local = screen.getByRole("button", { name: "Получить локальное объяснение" });
  fireEvent.click(local);
  fireEvent.click(local);
  fireEvent.click(screen.getByRole("button", { name: "Запустить AI-агента" }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(local).toBeDisabled();
  expect(screen.getByRole("button", { name: "Запустить AI-агента" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Сервер готовит локальное объяснение");
  expect(document.querySelector(".analysis-skeleton")).not.toBeNull();
  await act(async () => { resolve(success("local")); });
  expect(local).toBeEnabled();
});

it.each(["success", "error"])("aborts and ignores late %s from a changed scenario", async (outcome) => {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  request.mockReturnValueOnce(new Promise<Response>((done, fail) => { resolve = done; reject = fail; }));
  const { rerender } = render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  const oldSignal = request.mock.calls[0]![1].signal as AbortSignal;
  rerender(<ScenarioAnalysis result={otherResult} />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  request.mockResolvedValueOnce(success("local", "Новый сценарий.", otherResult));
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  await screen.findByText("Новый сценарий.");
  await act(async () => {
    if (outcome === "success") resolve(success("local", "Устаревшее объяснение."));
    else reject(new Error("Stale failure"));
  });
  expect(screen.getByText("Новый сценарий.")).toBeVisible();
  expect(screen.queryByText("Устаревшее объяснение.")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("clears a successful explanation on changed decisions and aborts on unmount", async () => {
  request.mockResolvedValueOnce(success("local"));
  const { rerender, unmount } = render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  await screen.findByRole("heading", { name: "Локальное объяснение — без AI" });
  rerender(<ScenarioAnalysis result={otherResult} />);
  expect(screen.queryByRole("heading", { name: "Локальное объяснение — без AI" })).not.toBeInTheDocument();
  request.mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Запустить AI-агента" }));
  const signal = request.mock.calls[1]![1].signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
});

it.each([
  () => new Response("<html>proxy failure</html>", { status: 200 }),
  () => new Response(JSON.stringify({ ok: true, source: "local", analysis: { summary: 123 } })),
  () => success("agent"),
  () => success("local", "Wrong plan.", otherResult),
])("rejects malformed, wrong-source and mismatched-scenario success replies", async (response) => {
  request.mockResolvedValue(response());
  render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Локальное объяснение — без AI" })).not.toBeInTheDocument();
});

it("reports network failures safely and re-enables controls", async () => {
  render(<ScenarioAnalysis result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Получить локальное объяснение" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("проверьте соединение");
  expect(screen.getByRole("button", { name: "Получить локальное объяснение" })).toBeEnabled();
  expect(result.datasetVersion).toBe(dataset.version);
});
