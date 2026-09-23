import { expect, test } from "@playwright/test";

test("city overview and five-decision flow work on desktop and mobile", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Аким на 5 часов" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Город в цифрах" }),
  ).toBeVisible();
  await expect(page.getByText("52,56")).toBeVisible();
  await page.getByRole("button", { name: "Выбрать решения" }).click();
  for (const [id, district] of [
    ["M7", "nura"],
    ["M8", "nura"],
    ["M10", "nura"],
    ["M12", ""],
    ["M5", "saryarka"],
  ]) {
    if (district)
      await page
        .getByLabel(`Район для ${id}`, { exact: true })
        .selectOption(district);
    await page
      .getByRole("button", { name: `Добавить ${id}`, exact: true })
      .click();
  }
  await expect(page.getByText("Осталось 5 ед.")).toBeVisible();
  await page.getByRole("button", { name: "Проверить сценарий" }).click();
  await expect(page.getByText("✓ План готов", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить план" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(page.getByText("Осталось 5 ед.")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /Состояние города/ }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /Ваши решения/ }).click();
  }
  const api = await request.post("/api/analyze", {
    data: { scenario: { decisions: [] } },
  });
  expect(api.status()).toBe(501);
  expect(await api.json()).toMatchObject({
    ok: false,
    error: { code: "NOT_IMPLEMENTED" },
  });
  expect(errors).toEqual([]);
});
