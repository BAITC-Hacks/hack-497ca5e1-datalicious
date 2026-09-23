import { expect, test } from "@playwright/test";

test("production scaffold loads and rejects invalid scenarios through the real API", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Аким на 5 часов" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Симулятор готовится к запуску" })).toBeVisible();
  const api = await request.post("/api/analyze", { data: { scenario: { decisions: [] } } });
  expect(api.status()).toBe(422);
  expect(await api.json()).toMatchObject({ ok: false, error: { code: "INVALID_SCENARIO" } });
  expect(errors).toEqual([]);
});
