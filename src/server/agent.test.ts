// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./openai", () => ({ createOpenAIContext: vi.fn() }));

import type { DistrictId, SimulationEngine, SimulationResult } from "@/domain/types";
import { createOpenAIContext } from "./openai";
import { AGENT_LIMITS, createAgentAnalysisService, runScenarioAgent } from "./agent";
import { toAgentScenario } from "./agent-tools";
import { createAnalyzeHandler } from "./analyze-handler";
import type { AgentBudgetPolicy } from "./agent-budget";
import { createResultFixture, deepFreeze, invalidEvaluation } from "./__tests__/fixtures";

const create = vi.fn();
const countInput = vi.fn();
const evaluate = vi.fn<SimulationEngine["evaluate"]>();
const engine: SimulationEngine = { evaluate, validate: vi.fn(), baseline: vi.fn() };

// Artificial scored results for protocol tests ONLY. These are not domain regression results.
function candidate(district: DistrictId, score: number): SimulationResult {
  const original = createResultFixture();
  return {
    ...original,
    scenario: { decisions: original.scenario.decisions.map(d => d.measureId === "M5" ? { ...d, districtId: district } : d) },
    after: { ...original.after, score },
  };
}
const first = () => candidate("almaty", 60);
const second = () => candidate("esil", 61);
const tokens = { input_tokens: 100, output_tokens: 20, total_tokens: 120,
  input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 5 } };
const call = (name: string, args: unknown, id: string) => ({
  type: "function_call" as const, id: `fc_${id}`, call_id: id, name, arguments: JSON.stringify(args),
});
const tool = (name: string, args: unknown, id: string) => ({
  status: "completed", output: [call(name, args, id)], output_text: "", usage: tokens,
});
const selection = (id: string) => ({
  status: "completed", usage: tokens, output_text: JSON.stringify({ selectedScenarioId: id }),
  output: [{ type: "message", id: "msg_end", role: "assistant", status: "completed",
    content: [{ type: "output_text", annotations: [], text: JSON.stringify({ selectedScenarioId: id }) }] }],
});
function received(callIndex: number, callId: string) {
  const input = create.mock.calls[callIndex]?.[0].input as Array<{ type?: string; call_id?: string; output?: string }>;
  const item = input.find(item => item.type === "function_call_output" && item.call_id === callId);
  return JSON.parse(item?.output ?? "null");
}

beforeEach(() => {
  create.mockReset(); evaluate.mockReset(); countInput.mockReset().mockResolvedValue({ input_tokens: 1_000 });
  vi.mocked(createOpenAIContext).mockReset().mockReturnValue({
    client: { responses: { create, inputTokens: { count: countInput } }, timeout: 20_000,
      baseURL: "https://api.openai.com/v1" } as unknown as ReturnType<typeof createOpenAIContext>["client"],
    model: "test-model",
  });
});

// Artificial prices solely for spending-guard tests; never used by a live run.
const testBudget = (maxUsd = 1): AgentBudgetPolicy => ({ maxUsd, maxInputTokens: 1_000,
  pricing: { model: "test-model", inputUsdPerMillion: 10, outputUsdPerMillion: 20,
    source: "https://developers.openai.com/api/docs/pricing", verifiedAt: new Date().toISOString() } });

describe("agent request and cost guards (all provider calls mocked)", () => {
  it("reserves worst-case cost before every request and blocks the second when budget is insufficient", async () => {
    create.mockResolvedValueOnce(tool("get_city_context", {}, "catalog"));
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget(0.06) })).rejects.toMatchObject({
      reason: "BUDGET_LIMIT", usage: { modelRequests: 1, tokenCountRequests: 2 },
      budget: { reservedUsd: 0.05, remainingUsd: 0.01, estimatedUsd: 0.0014 },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(countInput).toHaveBeenCalledTimes(2);
    expect(countInput.mock.calls[1]?.[0].input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: "catalog" }));
    expect(countInput.mock.calls[0]?.[0]).toMatchObject({ model: "test-model", tools: expect.any(Array),
      text: expect.any(Object), instructions: expect.any(String), truncation: "disabled" });
    expect(countInput.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 0 });
    expect(create.mock.calls[0]?.[0].service_tier).toBe("default");
  });

  it("stops before generation when the exact input count exceeds the permitted cap", async () => {
    countInput.mockResolvedValue({ input_tokens: 1_001 });
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget() })).rejects.toMatchObject({
      reason: "INPUT_TOKEN_LIMIT", usage: { modelRequests: 0 },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not dispatch an oversized initial context or send it to the counter", async () => {
    const original = { ...createResultFixture(), datasetVersion: "я".repeat(AGENT_LIMITS.contextBytes) };
    await expect(runScenarioAgent(original, engine, { budget: testBudget() })).rejects.toMatchObject({ reason: "CONTEXT_LIMIT" });
    expect(create).not.toHaveBeenCalled(); expect(countInput).not.toHaveBeenCalled();
  });

  it("rejects an oversized response before executing its tools", async () => {
    create.mockResolvedValueOnce({ ...tool("get_city_context", {}, "catalog"), output: [
      { type: "reasoning", id: "reasoning", summary: [], encrypted_content: "x".repeat(AGENT_LIMITS.responseBytes) },
      call("get_city_context", {}, "catalog"),
    ] });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({
      reason: "RESPONSE_LIMIT", usage: { modelRequests: 1, toolCalls: 0 },
    });
  });

  it("cannot send the application key to an unapproved SDK endpoint", async () => {
    vi.mocked(createOpenAIContext).mockReturnValue({ model: "test-model", client: {
      baseURL: "https://unapproved.invalid/v1", responses: { create, inputTokens: { count: countInput } }, timeout: 20_000,
    } as unknown as ReturnType<typeof createOpenAIContext>["client"] });
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget() })).rejects.toMatchObject({ reason: "ENDPOINT_NOT_APPROVED" });
    expect(create).not.toHaveBeenCalled(); expect(countInput).not.toHaveBeenCalled();
  });

  it("retains its reservation and reports unknown cost on network failure without retrying", async () => {
    create.mockRejectedValue(new Error("private provider error"));
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget() })).rejects.toMatchObject({
      reason: "PROVIDER_ERROR", usage: { modelRequests: 1, complete: false }, budget: { reservedUsd: 0.05, estimatedUsd: null },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not continue a paid run after an answer without usage", async () => {
    create.mockResolvedValueOnce({ ...tool("get_city_context", {}, "catalog"), usage: null });
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget() })).rejects.toMatchObject({
      reason: "USAGE_UNKNOWN", usage: { complete: false }, budget: { reservedUsd: 0.05, estimatedUsd: null },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("marks inconsistent usage incomplete instead of summing false token totals", async () => {
    create.mockResolvedValueOnce({ ...tool("get_city_context", {}, "catalog"), usage: { ...tokens, total_tokens: 999 } });
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: testBudget() })).rejects.toMatchObject({
      reason: "USAGE_LIMIT_MISMATCH", usage: { complete: false, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      budget: { estimatedUsd: null },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("requires prices for the exact configured model before any network operation", async () => {
    const policy = testBudget(); policy.pricing.model = "another-model";
    await expect(runScenarioAgent(createResultFixture(), engine, { budget: policy })).rejects.toMatchObject({ reason: "MODEL_PRICE_MISMATCH" });
    expect(create).not.toHaveBeenCalled(); expect(countInput).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.useRealTimers());

describe("agent loop (scripted model and domain doubles; no paid calls)", () => {
  it("uses tool feedback to propose another candidate, compares checked IDs and returns the verified best", async () => {
    const original = deepFreeze(createResultFixture());
    evaluate.mockReturnValueOnce({ ok: true, result: first() }).mockReturnValueOnce({ ok: true, result: second() });
    create.mockResolvedValueOnce({ ...tool("get_city_context", {}, "catalog"), output: [
      { type: "reasoning", id: "rs_test", summary: [], encrypted_content: "opaque-reasoning" },
      call("get_city_context", {}, "catalog"),
    ] });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "first"));
    create.mockImplementationOnce(async () => {
      expect(received(2, "first")).toMatchObject({ ok: true, scenarioId: "candidate-1", score: 60 });
      return tool("evaluate_scenario", { scenario: toAgentScenario(second().scenario) }, "second");
    });
    create.mockImplementationOnce(async () => {
      expect(received(3, "second")).toMatchObject({ ok: true, score: 61 });
      return tool("compare_scenarios", { leftId: "original", rightId: "candidate-2" }, "compare");
    });
    create.mockImplementationOnce(async () => {
      expect(received(4, "compare").scoreDifference).toBeCloseTo(4.45693);
      return selection("candidate-2");
    });

    const result = await runScenarioAgent(original, engine);
    expect(evaluate).toHaveBeenNthCalledWith(1, first().scenario);
    expect(evaluate).toHaveBeenNthCalledWith(2, second().scenario);
    expect(result.bestScenarioId).toBe("candidate-2");
    expect(result.improved).toBe(true);
    expect(result.analysis.recommendations.join(" ")).toContain("4,45693");
    expect(result.analysis.recommendations.join(" ")).toContain("M5 — Перевод частного сектора на чистое топливо (Есиль)");
    expect(result.analysis.summary).toContain("глобальный оптимум не установлен");
    expect(result.analysis.summary).not.toContain("Резервное");
    expect(original).toEqual(createResultFixture());
    expect(result.usage).toMatchObject({ modelRequests: 5, toolCalls: 4, inputTokens: 500,
      outputTokens: 100, totalTokens: 600, cachedInputTokens: 50, reasoningTokens: 25 });
    expect(result.journal.map(e => e.status)).toEqual(["catalog", "evaluated", "evaluated", "compared"]);
    expect(JSON.stringify(result.journal)).not.toContain("opaque-reasoning");
    expect(create.mock.calls[1]?.[0].input).toContainEqual(expect.objectContaining({ type: "reasoning", encrypted_content: "opaque-reasoning" }));
    for (const [body, options] of create.mock.calls) {
      expect(body).toMatchObject({ model: "test-model", max_output_tokens: 2000, store: false });
      expect(options.maxRetries).toBe(0);
      expect(options.timeout).toBeLessThanOrEqual(20_000);
      expect(body.tools.every((t: { type: string; strict: boolean }) => t.type === "function" && t.strict)).toBe(true);
    }
  });

  it("returns domain rejection without Score, then lets the model correct the proposal", async () => {
    evaluate.mockReturnValueOnce(invalidEvaluation([{ code: "DECISION_COUNT", message: "Нужно пять решений." }]))
      .mockReturnValueOnce({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: { decisions: [] } }, "invalid"));
    create.mockImplementationOnce(async () => {
      const feedback = received(1, "invalid");
      expect(feedback).toEqual({ ok: false, issues: [{ code: "DECISION_COUNT", message: "Нужно пять решений." }] });
      expect(feedback).not.toHaveProperty("score");
      return tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "fixed");
    });
    create.mockResolvedValueOnce(selection("candidate-1"));
    const result = await runScenarioAgent(createResultFixture(), engine);
    expect(result.improved).toBe(true);
    expect(result.journal[0]).not.toHaveProperty("score");
  });

  it("honestly reports no improvement and retains the original", async () => {
    evaluate.mockReturnValue({ ok: true, result: candidate("almaty", 50) });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "worse"))
      .mockResolvedValueOnce(selection("original"));
    const result = await runScenarioAgent(createResultFixture(), engine);
    expect(result.improved).toBe(false);
    expect(result.analysis.summary).toContain("Улучшения среди проверенных вариантов не найдено");
    expect(result.bestResult).toEqual(createResultFixture());
  });

  it("does not rerun equivalent permutations, including the original scenario", async () => {
    evaluate.mockReturnValue({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "once"))
      .mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario({ decisions: [...first().scenario.decisions].reverse() }) }, "duplicate"))
      .mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(createResultFixture().scenario) }, "original"))
      .mockResolvedValueOnce(selection("candidate-1"));
    const result = await runScenarioAgent(createResultFixture(), engine);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.journal.map(e => e.status)).toEqual(["evaluated", "cached", "cached"]);
    expect(received(2, "duplicate")).toMatchObject({ cached: true, scenarioId: "candidate-1" });
  });

  it("caches invalid candidates too and never attaches a Score to them", async () => {
    evaluate.mockReturnValue(invalidEvaluation([{ code: "UNKNOWN_MEASURE", message: "Неизвестная мера." }]));
    const invalid = { decisions: [{ measureId: "unknown", districtId: null }] };
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: invalid }, "invalid"))
      .mockResolvedValueOnce(tool("evaluate_scenario", { scenario: invalid }, "duplicate"))
      .mockResolvedValueOnce(selection("original"));
    const result = await runScenarioAgent(createResultFixture(), engine);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(received(2, "duplicate")).toMatchObject({ ok: false, cached: true });
    expect(received(2, "duplicate")).not.toHaveProperty("score");
    expect(result.improved).toBe(false);
    expect(result.analysis.summary).toContain("допустимых: 0");
  });

  it("reports numerical tradeoffs from verified results, not model prose", async () => {
    const better = first();
    const district = better.after.districts[0]!;
    const withTradeoff = { ...better, after: { ...better.after, districts: better.after.districts.map(d =>
      d.districtId === district.districtId ? { ...d, indicators: { ...d.indicators, T1: d.indicators.T1 - 3 } } : d) } };
    evaluate.mockReturnValue({ ok: true, result: withTradeoff });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(better.scenario) }, "better"))
      .mockResolvedValueOnce(selection("candidate-1"));
    const result = await runScenarioAgent(createResultFixture(), engine);
    expect(result.analysis.recommendations.some(text => text.includes("Компромисс альтернативы:") && text.includes("-3"))).toBe(true);
    expect(result.analysis.strengths.every(text => text.startsWith("Исходный сценарий:"))).toBe(true);
  });

  it.each([
    ["run_shell", {}, "UNKNOWN_TOOL"],
    ["evaluate_scenario", { scenario: "wrong" }, "INVALID_ARGUMENTS"],
    ["get_city_context", { arbitraryCode: "do something" }, "INVALID_ARGUMENTS"],
    ["compare_scenarios", { leftId: "original", rightId: "invented" }, "UNVERIFIED_SCENARIO"],
  ])("rejects %s safely and returns feedback", async (name, args, code) => {
    create.mockResolvedValueOnce(tool(name, args, "bad"));
    create.mockImplementationOnce(async () => {
      expect(received(1, "bad")).toEqual({ ok: false, error: code });
      expect(evaluate).not.toHaveBeenCalled();
      return tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "good");
    });
    evaluate.mockReturnValue({ ok: true, result: first() });
    create.mockResolvedValueOnce(selection("candidate-1"));
    expect((await runScenarioAgent(createResultFixture(), engine)).bestScenarioId).toBe("candidate-1");
  });

  it("does not execute malformed JSON arguments", async () => {
    create.mockResolvedValueOnce({ status: "completed", output: [{ ...call("evaluate_scenario", {}, "bad"), arguments: "{" }] })
      .mockResolvedValueOnce(selection("original"));
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "NO_SEARCH" });
    expect(received(1, "bad")).toEqual({ ok: false, error: "INVALID_ARGUMENTS" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(["invented", "original"])("rejects a final reference to %s when candidate-1 is the best", async id => {
    evaluate.mockReturnValue({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "first"))
      .mockResolvedValueOnce(selection(id));
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "INVALID_SELECTION", code: "AI_UNAVAILABLE" });
  });

  it("does not accept model-written score fields instead of checked facts", async () => {
    evaluate.mockReturnValue({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "first"))
      .mockResolvedValueOnce({ ...selection("candidate-1"), output_text: '{"selectedScenarioId":"candidate-1","score":999}' });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "INVALID_SELECTION" });
  });

  it("stops after six requests without publishing a partially found improvement", async () => {
    evaluate.mockReturnValue({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "first"));
    for (let i = 1; i < 6; i++) create.mockResolvedValueOnce(tool("get_city_context", {}, `repeat-${i}`));
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "MODEL_LIMIT", usage: { modelRequests: 6 } });
    expect(create).toHaveBeenCalledTimes(6);
  });

  it("enforces 12 tool calls even when a provider returns an oversized batch", async () => {
    create.mockResolvedValueOnce({ status: "completed", usage: tokens,
      output: Array.from({ length: 13 }, (_, i) => call("get_city_context", {}, `tool-${i}`)) });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "TOOL_LIMIT", usage: { toolCalls: 12 } });
  });

  it("aborts the whole search at the deadline even if the provider promise never settles", async () => {
    vi.useFakeTimers();
    create.mockImplementation(() => new Promise(() => {}));
    const assertion = expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(AGENT_LIMITS.timeoutMs);
    await assertion;
    expect(create.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "incomplete"])("rejects %s responses and still accounts for received usage", async status => {
    create.mockResolvedValue({ ...selection("original"), status });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "INCOMPLETE", usage: { totalTokens: 120 } });
  });

  it("handles provider failures without exposing their payload", async () => {
    create.mockRejectedValue(new Error("secret-key provider trace"));
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "PROVIDER_ERROR", usage: { modelRequests: 1 } });
    try { await runScenarioAgent(createResultFixture(), engine); } catch (error) {
      expect(String(error)).not.toContain("secret-key");
    }
  });

  it("rejects refusal and duplicate call IDs", async () => {
    create.mockResolvedValueOnce({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private" }] }] });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "REFUSAL" });
    create.mockResolvedValueOnce({ status: "completed", output: [call("get_city_context", {}, "same"), call("get_city_context", {}, "same")] });
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({ reason: "INVALID_TOOL_CALL" });
  });

  it("preserves the original API result when the agent recommends an alternative", async () => {
    evaluate.mockReturnValueOnce({ ok: true, result: createResultFixture() }).mockReturnValueOnce({ ok: true, result: first() });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "alternative"))
      .mockResolvedValueOnce(selection("candidate-1"));
    const handler = createAnalyzeHandler({ engine, analysis: createAgentAnalysisService(engine) });
    const response = await handler(new Request("http://localhost/api/analyze", { method: "POST",
      body: JSON.stringify({ scenario: createResultFixture().scenario }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toEqual(createResultFixture());
    expect(body.analysis.recommendations.join(" ")).toContain("Score альтернативы: 60");
  });

  it("maps a crashing candidate engine to safe HTTP 500, not AI success or a provider error", async () => {
    evaluate.mockReturnValueOnce({ ok: true, result: createResultFixture() })
      .mockImplementationOnce(() => { throw new Error("private domain trace"); });
    create.mockResolvedValueOnce(tool("evaluate_scenario", { scenario: toAgentScenario(first().scenario) }, "alternative"));
    const handler = createAnalyzeHandler({ engine, analysis: createAgentAnalysisService(engine) });
    const response = await handler(new Request("http://localhost/api/analyze", { method: "POST",
      body: JSON.stringify({ scenario: createResultFixture().scenario }) }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(body)).not.toContain("private domain trace");
    expect(body).not.toHaveProperty("analysis");
  });
});
