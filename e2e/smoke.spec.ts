import { expect, test } from "@playwright/test";

test("production scaffold loads and exposes the explicit analysis placeholder", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Аким на 5 часов" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Симулятор готовится к запуску" })).toBeVisible();
  const api = await request.post("/api/analyze", { data: { scenario: { decisions: [] } } });
  expect(api.status()).toBe(501);
  expect(await api.json()).toMatchObject({ ok: false, error: { code: "NOT_IMPLEMENTED" } });
  expect(errors).toEqual([]);
});
