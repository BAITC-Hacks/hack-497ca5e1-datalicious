import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectShell } from "./project-shell";
import { BudgetMeter } from "./simulator/decision-builder";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

function openBuilder() {
  render(<ProjectShell />);
  fireEvent.click(screen.getByRole("button", { name: /Выбрать решения/ }));
}

function add(id: string, district?: string) {
  if (district)
    fireEvent.change(screen.getByLabelText(`Район для ${id}`), {
      target: { value: district },
    });
  fireEvent.click(screen.getByRole("button", { name: `Добавить ${id}` }));
}

it("shows the city baseline, five districts and explicitly marked critical values", () => {
  render(<ProjectShell />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Аким на 5 часов" }),
  ).toBeVisible();
  expect(screen.getByText("52,56")).toBeVisible();
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(7);
  expect(within(table).getAllByText(/критический показатель/)).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "Нура" })).toBeVisible();
});

it("shows an accessible budget meter and remaining budget", () => {
  render(<BudgetMeter spent={95} limit={100} />);
  expect(
    screen.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "95");
  expect(screen.getByText("Осталось 5 ед.")).toBeVisible();
});

it("requires a district, prevents repeats, and removes measures without losing other selections", () => {
  openBuilder();
  expect(screen.getByRole("button", { name: "Добавить M7" })).toBeDisabled();
  add("M7", "nura");
  add("M12");
  expect(screen.queryByLabelText("Район для M12")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Добавлено M7" })).toBeDisabled();
  expect(screen.getByText("Осталось 62 ед.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Удалить M7" }));
  expect(screen.getByText("Осталось 86 ед.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить M7" })).toBeEnabled();
});

it("blocks same-district conflicts but allows selecting a different district", () => {
  openBuilder();
  add("M7", "nura");
  fireEvent.change(screen.getByLabelText("Район для M4"), {
    target: { value: "nura" },
  });
  expect(screen.getByRole("button", { name: "Добавить M4" })).toBeDisabled();
  expect(screen.getByText(/M4 и M7 несовместимы в одном районе/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Район для M4"), {
    target: { value: "esil" },
  });
  expect(screen.getByRole("button", { name: "Добавить M4" })).toBeEnabled();
});

it("enforces global incompatibility regardless of districts", () => {
  openBuilder();
  add("M1", "nura");
  fireEvent.change(screen.getByLabelText("Район для M3"), {
    target: { value: "esil" },
  });
  expect(screen.getByRole("button", { name: "Добавить M3" })).toBeDisabled();
  expect(screen.getByText(/M1 и M3 несовместимы/)).toBeVisible();
});

it("blocks a third measure of the same direction and budget overflow", () => {
  openBuilder();
  add("M7", "nura");
  add("M8", "nura");
  fireEvent.change(screen.getByLabelText("Район для M9"), {
    target: { value: "esil" },
  });
  expect(screen.getByRole("button", { name: "Добавить M9" })).toBeDisabled();
  expect(screen.getByText(/не больше 2 мер одного направления/)).toBeVisible();
  add("M3", "esil");
  fireEvent.change(screen.getByLabelText("Район для M13"), {
    target: { value: "almaty" },
  });
  expect(screen.getByRole("button", { name: "Добавить M13" })).toBeDisabled();
  expect(screen.getByText("Не хватает 2 ед. бюджета.")).toBeVisible();
});

it("filters the catalog while retaining selected decisions", () => {
  openBuilder();
  add("M7", "nura");
  fireEvent.click(screen.getByRole("button", { name: "Транспорт" }));
  expect(
    within(
      screen.getByRole("region", { name: /Каталог мероприятий/ }),
    ).getAllByRole("article"),
  ).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Удалить M7" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Транспорт" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("completes the organizer example with cost 95 and synergy, without a fabricated result", () => {
  openBuilder();
  const review = screen.getByRole("button", { name: /Проверить сценарий/ });
  expect(review).toBeDisabled();
  add("M7", "nura");
  add("M8", "nura");
  add("M10", "nura");
  add("M12");
  add("M5", "saryarka");
  expect(screen.getByText("Осталось 5 ед.")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: /Синергии в вашем плане/ }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить M14" })).toBeDisabled();
  expect(review).toBeEnabled();
  fireEvent.click(review);
  expect(screen.getByText(/План готов/)).toBeVisible();
  expect(
    screen.getByText(/Расчёт итогового результата появится/),
  ).toBeVisible();
  expect(screen.queryByText(/56[.,]54/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Удалить M5" }));
  expect(review).toBeDisabled();
  expect(screen.queryByText(/План готов/)).not.toBeInTheDocument();
});

it("saves and restores partial drafts and keeps selections when changing steps", () => {
  openBuilder();
  add("M7", "nura");
  fireEvent.click(screen.getByRole("button", { name: /Сохранить план/ }));
  fireEvent.click(screen.getByRole("button", { name: "Очистить план" }));
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  expect(screen.getByRole("button", { name: "Удалить M7" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Состояние города/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ваши решения/ }));
  expect(screen.getByText("Осталось 76 ед.")).toBeVisible();
});

it("rejects damaged storage without replacing current work", () => {
  openBuilder();
  add("M12");
  localStorage.setItem(
    "akim-scenario:organizers-v1",
    JSON.stringify({ decisions: [{ measureId: "M100" }] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
  expect(
    screen.getByText(/Сохранённый план не соответствует правилам/),
  ).toBeVisible();
  expect(screen.getByText("Осталось 86 ед.")).toBeVisible();
});
