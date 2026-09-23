import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DistrictId } from "@/domain/types";
import { simulationEngine } from "@/domain";
import { ProjectShell } from "./project-shell";
import { dataset } from "@/data/dataset";

vi.mock("./city/city-map", () => ({
  CityMap: ({ onSelect }: { onSelect: (id: DistrictId) => void }) => (
    <div aria-label="3D-карта">
      <button onClick={() => onSelect("nura")}>Выбрать район Нура</button>
    </div>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected request")));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function district(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("group", { name: "Районы и общегородские меры" }),
    ).getByRole("button", { name }),
  );
}
function direction(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("group", { name: "Направление мероприятий" }),
    ).getByRole("button", { name }),
  );
}
function add(id: string) {
  fireEvent.click(screen.getByRole("button", { name: `Добавить ${id}` }));
}
function example() {
  district("Нура");
  add("M7");
  add("M8");
  direction("Безопасность");
  add("M10");
  district("Весь город ↗");
  add("M12");
  district("Сарыарка");
  add("M5");
}

it("starts with a quiet map, budget, five district choices and no data table", () => {
  render(<ProjectShell />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Аким");
  expect(
    screen.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "0");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
});

it("opens district problems and contextual measures from the map", () => {
  render(<ProjectShell />);
  fireEvent.click(screen.getByRole("button", { name: "Выбрать район Нура" }));
  expect(screen.getByRole("complementary", { name: "Нура" })).toBeVisible();
  const indicators = screen.getByLabelText("Десять показателей района");
  expect(indicators.querySelectorAll("dt")).toHaveLength(10);
  const nura = dataset.districts.find((d) => d.id === "nura")!;
  dataset.indicators.forEach((indicator, index) => {
    expect(indicators.querySelectorAll("dt")[index]).toHaveTextContent(
      indicator.name,
    );
    expect(indicators.querySelectorAll("dd")[index]).toHaveTextContent(
      String(nura.indicators[indicator.id]),
    );
  });
  expect(screen.getByText(/49,18/)).toBeVisible();
  expect(screen.getAllByText("Ниже критического порога")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Добавить M7" })).toBeEnabled();
  add("M7");
  expect(screen.getByRole("button", { name: "Добавлено M7" })).toBeDisabled();
  expect(
    screen.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "24");
  expect(screen.getByRole("list", { name: "Пять решений" })).toHaveTextContent(
    "Нура",
  );
});

it("blocks conflicts in the same district and permits the same measure elsewhere", () => {
  render(<ProjectShell />);
  district("Нура");
  add("M7");
  direction("Экология");
  expect(screen.getByRole("button", { name: "Добавить M4" })).toBeDisabled();
  expect(screen.getByText("Конфликт за участок.")).toBeVisible();
  district("Сарыарка");
  expect(screen.getByRole("button", { name: "Добавить M4" })).toBeEnabled();
});

it("blocks the third social measure and budget overflow", () => {
  render(<ProjectShell />);
  district("Нура");
  add("M7");
  add("M8");
  expect(screen.getByRole("button", { name: "Добавить M9" })).toBeDisabled();
  direction("Транспорт");
  add("M3");
  direction("Сервисы");
  expect(screen.getByRole("button", { name: "Добавить M13" })).toBeDisabled();
  expect(screen.getByText("Стоимость 102 превышает бюджет 100.")).toBeVisible();
});

it("prevents M1 and M3 in different districts", () => {
  render(<ProjectShell />);
  district("Есиль");
  add("M1");
  district("Алматы");
  direction("Транспорт");
  expect(screen.getByRole("button", { name: "Добавить M3" })).toBeDisabled();
  expect(screen.getByText("Либо BRT, либо ЛРТ, в любом районе.")).toBeVisible();
});

it("preserves selections across districts, excludes a district for city measures, and saves partial plans", () => {
  render(<ProjectShell />);
  district("Весь город ↗");
  add("M12");
  district("Нура");
  add("M7");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  expect(
    JSON.parse(localStorage.getItem("akim-scenario:organizers-v1")!).decisions,
  ).toEqual([{ measureId: "M12" }, { measureId: "M7", districtId: "nura" }]);
  fireEvent.click(screen.getByRole("button", { name: "Удалить M7" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  expect(screen.getByRole("button", { name: "Удалить M7" })).toBeVisible();
  expect(
    screen.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "38");
});

it("rejects malformed saved data without discarding the current selection", () => {
  render(<ProjectShell />);
  district("Нура");
  add("M7");
  localStorage.setItem(
    "akim-scenario:organizers-v1",
    JSON.stringify({ decisions: [{ measureId: "M100" }] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  expect(
    screen.getByText(/Сохранённый план не соответствует правилам/),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Удалить M7" })).toBeVisible();
});

it("preserves the ten-second demo and shows the real engine result without an automatic AI request", () => {
  vi.useFakeTimers();
  render(<ProjectShell />);
  example();
  expect(
    screen.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "95");
  fireEvent.click(screen.getByRole("button", { name: /Запустить план/ }));
  expect(
    screen.getByRole("region", { name: "Демонстрация плана" }),
  ).toBeVisible();
  expect(document.querySelector(".plan-dock")).toHaveAttribute("inert");
  act(() => vi.advanceTimersByTime(9999));
  expect(
    screen.getByRole("region", { name: "Демонстрация плана" }),
  ).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("Демонстрация завершена")).toBeVisible();
  expect(screen.getByText(/Реальные работы не запускались/)).toBeVisible();
  expect(screen.getByRole("dialog", { name: "Результат расчёта" })).toBeVisible();
  expect(screen.getByTestId("final-score")).toHaveTextContent("56,54307");
  expect(screen.getByTestId("result-budget")).toHaveTextContent("95 / 100");
  expect(screen.getByText("Остаток: 5 ед.")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("allows skipping construction and editing the plan afterwards", () => {
  vi.useFakeTimers();
  render(<ProjectShell />);
  example();
  fireEvent.click(screen.getByRole("button", { name: /Запустить план/ }));
  fireEvent.click(screen.getByRole("button", { name: /Пропустить анимацию/ }));
  expect(screen.getByText("Демонстрация завершена")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Вернуться к городу/ }));
  fireEvent.click(screen.getByRole("button", { name: "Удалить M5" }));
  expect(screen.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
  expect(document.querySelector(".plan-dock")).not.toHaveAttribute("inert");
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("uses the engine before animation, and never hides an engine exception with an explanation", () => {
  render(<ProjectShell />);
  example();
  vi.spyOn(simulationEngine, "evaluate").mockImplementation(() => { throw new Error("private engine failure"); });
  fireEvent.click(screen.getByRole("button", { name: /Запустить план/ }));
  expect(screen.getByRole("status")).toHaveTextContent("Не удалось рассчитать сценарий");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("private engine failure")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("supports reduced motion, keyboard dismissal and clearing the real result for a new scenario", () => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  render(<ProjectShell />);
  example();
  fireEvent.click(screen.getByRole("button", { name: /Запустить план/ }));
  expect(screen.queryByRole("region", { name: "Демонстрация плана" })).not.toBeInTheDocument();
  const dialog = screen.getByRole("dialog", { name: "Результат расчёта" });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Запустить план/ }));
  fireEvent.click(screen.getByRole("button", { name: "Новый сценарий" }));
  expect(screen.queryByTestId("final-score")).not.toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Использованный бюджет" })).toHaveAttribute("value", "0");
  expect(screen.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});
