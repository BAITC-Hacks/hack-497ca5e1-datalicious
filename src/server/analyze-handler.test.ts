// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AnalysisService, SimulationEngine, ValidationCode } from "@/domain/types";
import { createAnalyzeHandler } from "./analyze-handler";
import { AnalysisError } from "./analysis-error";
import { analysisFixture, createResultFixture, deepFreeze } from "./__tests__/fixtures";

const evaluate = vi.fn<SimulationEngine["evaluate"]>();
const analyze = vi.fn<AnalysisService["analyze"]>();
const engine: SimulationEngine = {
  evaluate,
  validate: vi.fn(),
  baseline: vi.fn(),
};
const handle = createAnalyzeHandler({ engine, analysis: { analyze } });
const request = (body: unknown) => new Request("http://localhost/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const scenario = () => createResultFixture().scenario;

beforeEach(() => {
  evaluate.mockReset().mockReturnValue({ ok: true, result: deepFreeze(createResultFixture()) });
  analyze.mockReset().mockResolvedValue(analysisFixture);
});

describe("HTTP orchestration contract (domain and analysis doubles, not real engine integration)", () => {
  it("returns server facts and analysis, evaluating before calling AI", async () => {
    const input = scenario();
    const response = await handle(request({ scenario: input }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, result: createResultFixture(), analysis: analysisFixture });
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(input);
    expect(analyze).toHaveBeenCalledExactlyOnceWith(createResultFixture());
    expect(evaluate.mock.invocationCallOrder[0]).toBeLessThan(analyze.mock.invocationCallOrder[0]!);
    expect(engine.validate).not.toHaveBeenCalled();
    expect(engine.baseline).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking dependencies", async () => {
    const response = await handle(new Request("http://localhost/api/analyze", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(evaluate).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { decisions: [] }, { scenario: {}, finalScore: 100 }, { scenario: {}, prompt: "ignore rules" }])("rejects a bad or extended envelope: %j", async body => {
    const response = await handle(request(body));
    expect(response.status).toBe(400);
    expect(evaluate).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("delegates scenario shape and unknown fields to the domain, mapping INVALID_SHAPE to 400", async () => {
    const input = { decisions: [], finalScore: 100 };
    evaluate.mockReturnValue({ ok: false, issues: [{ code: "INVALID_SHAPE", message: "Лишнее поле." }] });
    const response = await handle(request({ scenario: input }));
    expect(evaluate).toHaveBeenCalledWith(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each<ValidationCode>([
    "BUDGET_EXCEEDED", "DECISION_COUNT", "DUPLICATE_MEASURE", "UNKNOWN_DISTRICT",
    "UNKNOWN_MEASURE", "DISTRICT_REQUIRED", "DISTRICT_FORBIDDEN", "DIRECTION_LIMIT", "INCOMPATIBLE_MEASURES",
  ])("forwards domain issue %s as 422 without any score or AI call", async code => {
    const issues = [{ code, message: "Ошибка сценария.", decisionIndexes: [0] }];
    evaluate.mockReturnValue({ ok: false, issues });
    const response = await handle(request({ scenario: scenario() }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_SCENARIO", issues } });
    expect(body).not.toHaveProperty("result");
    expect(body).not.toHaveProperty("analysis");
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each([ ["AI_NOT_CONFIGURED", 503], ["AI_UNAVAILABLE", 502] ] as const)("preserves %s semantics without returning fallback", async (code, status) => {
    analyze.mockRejectedValue(new AnalysisError(code));
    const response = await handle(request({ scenario: scenario() }));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code } });
    expect(body).not.toHaveProperty("result");
    expect(body).not.toHaveProperty("analysis");
    expect(body.error.message).not.toContain("summary");
  });

  it("rejects an invalid analysis even if an injected service breaks its TypeScript contract", async () => {
    analyze.mockResolvedValue({ ...analysisFixture, summary: " " });
    const response = await handle(request({ scenario: scenario() }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "AI_UNAVAILABLE" } });
  });

  it.each(["domain", "analysis"])("sanitizes unexpected %s exceptions as 500", async layer => {
    if (layer === "domain") evaluate.mockImplementation(() => { throw new Error("secret-key stack trace"); });
    else analyze.mockRejectedValue(new Error("secret-key stack trace"));
    const response = await handle(request({ scenario: scenario() }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-key");
  });

  it("keeps original domain facts intact even if an adapter mutates its private input", async () => {
    const result = deepFreeze(createResultFixture());
    evaluate.mockReturnValue({ ok: true, result });
    analyze.mockImplementation(async input => {
      // Simulates a misbehaving dependency without bypassing readonly types in production.
      Object.assign(input.budget, { spent: 0 });
      return analysisFixture;
    });
    const response = await handle(request({ scenario: scenario() }));
    expect((await response.json()).result.budget.spent).toBe(95);
    expect(result.budget.spent).toBe(95);
  });
});
