import { expect, test } from "@playwright/test";

test("3D district selection, construction and saved plans work on desktop and mobile", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("city-map")).toHaveAttribute(
    "data-renderer",
    "ready",
    { timeout: 20000 },
  );
  // Hit the actual canvas, not just the accessible DOM labels: the robot's
  // target must come from the scene raycaster for every district.
  for (const [id, name] of [
    ["esil", "Есиль"],
    ["almaty", "Алматы"],
    ["saryarka", "Сарыарка"],
    ["baikonur", "Байконур"],
    ["nura", "Нура"],
  ]) {
    const label = page.getByRole("button", {
      name: `Выбрать район ${name}`,
      exact: true,
    });
    const bounds = (await label.boundingBox())!;
    let hit = false;
    for (const [dx, dy] of [
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
  await expect(page.getByRole("dialog", { name: "Работы идут" })).toBeVisible();
  await expect(
    page.getByText("ПЛАН ВИЗУАЛИЗИРОВАН", { exact: true }),
  ).toBeVisible({ timeout: 13000 });
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
  expect(errors).toEqual([]);
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
