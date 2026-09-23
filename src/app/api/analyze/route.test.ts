// @vitest-environment node
import { expect, it } from "vitest";
import { POST } from "./route";

it("reports that analysis is unavailable without returning fabricated results", async () => {
  const response = await POST();
  expect(response.status).toBe(501);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_IMPLEMENTED" } });
});
