import { expect, test, type Page } from "@playwright/test";

const organizerScenario = {
  decisions: [
    { measureId: "M7", districtId: "nura" },
    { measureId: "M8", districtId: "nura" },
    { measureId: "M10", districtId: "nura" },
    { measureId: "M12" },
    { measureId: "M5", districtId: "saryarka" },
  ],
};

/** Safety guard only: real local requests pass through to the production server. */
async function allowOnlyLocalAnalysis(page: Page) {
  const modes: unknown[] = [];
  await page.route("**/api/analyze", async (route) => {
    const mode = route.request().postDataJSON()?.mode;
    modes.push(mode);
    // A regression must fail the test, not accidentally spend API tokens.
    if (mode !== "local") await route.abort("blockedbyclient");
    else await route.continue();
  });
  return modes;
}

async function selectOrganizerScenario(page: Page) {
  const districts = page.getByRole("group", {
    name: "Районы и общегородские меры",
  });
  await districts.getByRole("button", { name: "Нура", exact: true }).click();
  await page.getByRole("button", { name: "Добавить M7", exact: true }).click();
  await page.getByRole("button", { name: "Добавить M8", exact: true }).click();
  await page
    .getByRole("group", { name: "Направление мероприятий" })
    .getByRole("button", { name: "Безопасность", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить M10", exact: true }).click();
  await districts.getByRole("button", { name: "Весь город ↗", exact: true }).click();
  await page.getByRole("button", { name: "Добавить M12", exact: true }).click();
  await districts.getByRole("button", { name: "Сарыарка", exact: true }).click();
  await page.getByRole("button", { name: "Добавить M5", exact: true }).click();
}

test("real engine and local explanation work with 3D selection, construction and saved plans", async ({
  page,
}, testInfo) => {
  // This includes the preserved WebGL/raycast/resizing flow plus real HTTP
  // analysis and four result screenshots; no assertion timeout is relaxed.
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const modes = await allowOnlyLocalAnalysis(page);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Аким на 5 часов" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
  await expect(page.getByTestId("city-map")).toHaveAttribute(
    "data-renderer",
    "ready",
    { timeout: 20000 },
  );
  await page.screenshot({ path: "artifacts/astana-overview.png" });
  // Hit the actual canvas, not just the accessible DOM labels: the robot's
  // target must come from the scene raycaster for every district.
  for (const [id, name] of [
    ["esil", "Есиль"],
    ["almaty", "Алматы"],
    ["saryarka", "Сарыарка"],
    ["baikonur", "Байконыр"],
    ["nura", "Нура"],
  ]) {
    const label = page.getByRole("button", {
      name: `Выбрать район ${name}`,
      exact: true,
    });
    const bounds = (await label.boundingBox())!;
    let hit = false;
    for (const [dx, dy] of [
      [0, 24],
      [0, -24],
      [48, 0],
      [-48, 0],
      [0, 38],
      [35, 42],
      [-35, 42],
      [0, 58],
    ]) {
      await page.mouse.move(
        bounds.x + bounds.width / 2 + dx!,
        bounds.y + bounds.height / 2 + dy!,
      );
      if (
        (await page
          .locator(".map-canvas")
          .getAttribute("data-robot-target")) === id
      ) {
        hit = true;
        break;
      }
    }
    expect(hit, `raycast district ${id}`).toBe(true);
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-robot-state",
      "pointing",
    );
  }
  await page.mouse.move(30, 30);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-robot-state",
    "idle",
  );
  await page
    .getByRole("button", { name: "Выбрать район Нура", exact: true })
    .click();
  await expect(page.getByRole("complementary", { name: "Нура" })).toBeVisible();
  await expect(
    page.getByLabel("Десять показателей района").locator("dd"),
  ).toHaveCount(10);
  await expect(page.getByText(/49,18/)).toBeVisible();
  await page.getByRole("button", { name: "Добавить M7", exact: true }).click();
  await page.getByRole("button", { name: "Добавить M8", exact: true }).click();
  await page
    .getByRole("group", { name: "Направление мероприятий" })
    .getByRole("button", { name: "Безопасность", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить M10", exact: true }).click();
  await page
    .getByRole("group", { name: "Районы и общегородские меры" })
    .getByRole("button", { name: "Весь город ↗", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить M12", exact: true }).click();
  await page
    .getByRole("button", { name: "Выбрать район Сарыарка", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить M5", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "95");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("button", { name: "Запустить план", exact: false })
    .click();
  await expect(
    page.getByRole("region", { name: "Демонстрация плана" }),
  ).toBeVisible();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-active-stage",
    "2",
    { timeout: 4000 },
  );
  await page.screenshot({ path: "artifacts/astana-plan.png" });
  await expect(
    page.getByText("Демонстрация завершена", { exact: true }),
  ).toBeVisible({ timeout: 13000 });
  const result = page.getByRole("dialog", { name: "Результат расчёта" });
  await expect(result).toBeVisible();
  await expect(result.getByTestId("final-score")).toHaveText("56,54307");
  await expect(result.getByTestId("result-budget")).toHaveText("95 / 100");
  await result.locator("summary").filter({ hasText: "Нура" }).click();
  const indicators = result.getByRole("table", { name: "Показатели до и после: Нура" });
  await expect(indicators.getByRole("row").filter({ hasText: "S1" })).toContainText("38");
  await expect(indicators.getByRole("row").filter({ hasText: "S1" })).toContainText("48");
  await expect(indicators.getByRole("row").filter({ hasText: "S2" })).toContainText("43,75");
  // Neither opening the page, choosing decisions nor calculating invokes AI.
  expect(modes).toEqual([]);
  const localResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/analyze") && r.request().method() === "POST",
  );
  await result.getByRole("button", { name: "Получить локальное объяснение", exact: true }).click();
  const analysisResponse = await localResponse;
  expect(analysisResponse.status()).toBe(200);
  const sentRequest = analysisResponse.request().postDataJSON();
  expect(sentRequest).toEqual({
    mode: "local",
    scenario: { decisions: expect.arrayContaining(organizerScenario.decisions) },
  });
  expect(sentRequest.scenario.decisions).toHaveLength(5);
  const analysis = await analysisResponse.json();
  expect(analysis).toMatchObject({
    ok: true,
    source: "local",
    result: { budget: { spent: 95, remaining: 5 } },
  });
  expect(analysis.result.baseline.score).toBeCloseTo(52.55768, 5);
  expect(analysis.result.after.score).toBeCloseTo(56.54307, 5);
  await expect(result.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true })).toBeVisible();
  await expect(result.getByText(analysis.analysis.summary, { exact: true })).toBeVisible();
  await expect(result.getByText(/После решений движок не выявил критических показателей/)).toBeVisible();
  await result.getByTestId("final-score").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("result-score-desktop.png") });
  await result.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("result-local-desktop.png") });
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(result.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await result.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("result-local-mobile.png") });
  await result.getByTestId("final-score").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("result-score-mobile.png") });
  await page.setViewportSize(desktopViewport);
  expect(modes).toEqual(["local"]);
  await page.getByRole("button", { name: /Вернуться к городу/ }).click();
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "Использованный бюджет" }),
  ).toHaveAttribute("value", "95");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("group", { name: "Районы и общегородские меры" })
      .getByRole("button", { name: "Нура", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Закрыть район", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Удалить M5", exact: true }).click();
  await expect(page.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true })).toHaveCount(0);
  expect(modes).toEqual(["local"]);
  expect(errors).toEqual([]);
});

test("real local API rejects incomplete and over-budget scenarios without analysis", async ({ request }) => {
  for (const [scenario, code] of [
    [{ decisions: organizerScenario.decisions.slice(0, 4) }, "DECISION_COUNT"],
    [{ decisions: [
      { measureId: "M3", districtId: "nura" },
      { measureId: "M5", districtId: "saryarka" },
      { measureId: "M7", districtId: "nura" },
      { measureId: "M8", districtId: "nura" },
      { measureId: "M13", districtId: "almaty" },
    ] }, "BUDGET_EXCEEDED"],
  ] as const) {
    const response = await request.post("/api/analyze", { data: { mode: "local", scenario } });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_SCENARIO" } });
    expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    expect(body).not.toHaveProperty("result");
    expect(body).not.toHaveProperty("analysis");
  }
});

test("UI prevents an over-budget fifth decision and keeps the incomplete plan unlaunchable", async ({ page }) => {
  test.setTimeout(60000);
  const modes = await allowOnlyLocalAnalysis(page);
  await page.goto("/");
  const districts = page.getByRole("group", { name: "Районы и общегородские меры" });
  for (const [district, direction, measure] of [
    ["Нура", "Транспорт", "M3"],
    ["Сарыарка", "Экология", "M5"],
    ["Нура", "Соцсфера", "M7"],
    ["Нура", "Соцсфера", "M8"],
  ]) {
    await districts.getByRole("button", { name: district!, exact: true }).click();
    await page.getByRole("group", { name: "Направление мероприятий" })
      .getByRole("button", { name: direction!, exact: true }).click();
    await page.getByRole("button", { name: `Добавить ${measure}`, exact: true }).click();
  }
  await expect(page.getByRole("progressbar", { name: "Использованный бюджет" })).toHaveAttribute("value", "99");
  await districts.getByRole("button", { name: "Алматы", exact: true }).click();
  await page.getByRole("group", { name: "Направление мероприятий" })
    .getByRole("button", { name: "Сервисы", exact: true }).click();
  await expect(page.getByRole("button", { name: "Добавить M13", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Запустить план/ })).toBeDisabled();
  await expect(page.getByRole("progressbar", { name: "Использованный бюджет" })).toHaveAttribute("value", "99");
  expect(modes).toEqual([]);
});

test("UI-only: simulated HTTP 500 is visible and preserves the computed result", async ({ page }) => {
  test.setTimeout(60000);
  // This is intentionally a browser response double, not a backend failure test.
  const modes: unknown[] = [];
  await page.route("**/api/analyze", async (route) => {
    modes.push(route.request().postDataJSON()?.mode);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: "Не удалось выполнить запрос. Повторите попытку." } }),
    });
  });
  await page.goto("/");
  await selectOrganizerScenario(page);
  await page.getByRole("button", { name: /Запустить план/ }).click();
  await page.getByRole("button", { name: /Пропустить анимацию/ }).click();
  const result = page.getByRole("dialog", { name: "Результат расчёта" });
  await expect(result.getByTestId("final-score")).toHaveText("56,54307");
  expect(modes).toEqual([]);
  await result.getByRole("button", { name: "Получить локальное объяснение", exact: true }).click();
  await expect(result.getByRole("alert")).toBeVisible();
  await expect(result.getByTestId("final-score")).toHaveText("56,54307");
  await expect(result.getByRole("button", { name: "Получить локальное объяснение", exact: true })).toBeEnabled();
  await expect(result.getByRole("heading", { name: "Локальное объяснение — без AI", exact: true })).toHaveCount(0);
  expect(modes).toEqual(["local"]);
});

test("touch selection and keyboard fallback work with reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("city-map")).toHaveAttribute(
    "data-renderer",
    "ready",
  );
  await page.screenshot({ path: "artifacts/astana-mobile.png" });
  await page
    .getByRole("button", { name: "Выбрать район Нура", exact: true })
    .tap();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-robot-target",
    "nura",
  );
  const nuraBounds = (await page
    .getByRole("button", { name: "Выбрать район Нура", exact: true })
    .boundingBox())!;
  await page.touchscreen.tap(
    nuraBounds.x + nuraBounds.width / 2,
    nuraBounds.y + nuraBounds.height + 25,
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-robot-target",
    "nura",
  );
  await expect(
    page.getByLabel("Десять показателей района").locator("dd"),
  ).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Exercise context-loss cleanup: renderer is removed and the same choices
  // remain accessible without the canvas or any robot event surface.
  await page
    .locator(".map-canvas canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.getByTestId("city-map")).toHaveAttribute(
    "data-renderer",
    "fallback",
  );
  await expect(page.locator(".map-canvas canvas")).toHaveCount(0);
  const esil = page.getByRole("button", {
    name: "Выбрать район Есиль",
    exact: true,
  });
  await esil.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Есиль" }),
  ).toBeVisible();
  await context.close();
});
