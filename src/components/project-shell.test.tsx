import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProjectShell } from "./project-shell";

it("exposes an accessible project entry and its current availability", () => {
  render(<ProjectShell />);
  expect(screen.getByRole("heading", { level: 1, name: "Аким на 5 часов" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Симулятор готовится к запуску" })).toBeVisible();
});
