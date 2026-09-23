// @vitest-environment node
import { expect, it } from "vitest";
import { POST } from "./route";

it("reports that analysis is unavailable without returning fabricated results", async () => {
  const response = await POST();
  expect(response.status).toBe(501);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, error: { code: "NOT_IMPLEMENTED" } });
  expect(body).not.toHaveProperty("result");
  expect(body).not.toHaveProperty("analysis");
});
