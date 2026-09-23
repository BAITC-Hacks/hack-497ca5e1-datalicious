// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { exampleDecisions } from "@/data/dataset";
import { simulationEngine } from "@/domain";
import type { Scenario, SimulationResult } from "@/domain/types";
import { runLiveAgentCheck } from "./live-agent-check";
import { toAgentScenario } from "./agent-tools";
import type { AgentBudgetPolicy } from "./agent-budget";
import { deepFreeze } from "./__tests__/fixtures";

const fetchMock = vi.fn<typeof fetch>();
const example: Scenario = { decisions: exampleDecisions };

/** Artificial rates for guard arithmetic; NOT a verified real model tariff or a paid run. */
function policy(): AgentBudgetPolicy {
  return {
    maxUsd: 1, maxInputTokens: 16_000,
    pricing: {
      model: "test-live-entry-model", inputUsdPerMillion: 10, outputUsdPerMillion: 30,
      verifiedAt: new Date().toISOString(), source: "https://developers.openai.com/api/docs/pricing",
    },
  };
}

function evaluate(scenario: Scenario): SimulationResult {
  const result = simulationEngine.evaluate(scenario);
  if (!result.ok) throw new Error("Test scenario must be valid under the real engine.");
  return result.result;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function modelReply(output: unknown[], input: number, emitted: number): Response {
  return json({
    id: "resp_test", object: "response", created_at: 1, status: "completed", error: null,
    service_tier: "default", output,
    usage: {
      input_tokens: input, output_tokens: emitted, total_tokens: input + emitted,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("OPENAI_MODEL", "test-live-entry-model");
  vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  fetchMock.mockReset().mockRejectedValue(new Error("Unexpected HTTP request in free test"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("manual live-check entry with real engine and installed SDK but fully mocked HTTP; no paid calls", () => {
  it.each([undefined, null, {}, { pricing: null }])("fails closed for an invalid manual policy %j before any request", invalidPolicy => {
    return expect(runLiveAgentCheck(example, invalidPolicy)).resolves.toMatchObject({
      status: "failed", reason: "INVALID_BUDGET_POLICY", usage: null, model: null,
    }).then(() => { expect(fetchMock).not.toHaveBeenCalled(); });
  });

  it("runs a two-response tool cycle using actual domain facts and counts input before each response request", async () => {
    const input = deepFreeze(structuredClone(example));
    const original = evaluate(input);
    const candidate: Scenario = {
      decisions: exampleDecisions.map(decision => decision.measureId === "M5"
        ? { ...decision, districtId: "nura" } : decision),
    };
    const calculated = evaluate(candidate);
    const selectedId = calculated.after.score > original.after.score ? "candidate-1" : "original";
    const recommended = selectedId === "candidate-1" ? calculated : original;
    const outgoing: Array<{ path: string; body: Record<string, unknown> }> = [];
    fetchMock.mockImplementation(async (url, init) => {
      const request = new Request(url, init);
      const path = new URL(request.url).pathname;
      const body = await request.json();
      outgoing.push({ path, body });
      expect(new URL(request.url).origin).toBe("https://api.openai.com");
      expect(body.model).toBe("test-live-entry-model");
      switch (outgoing.length) {
        case 1:
          expect(path).toBe("/v1/responses/input_tokens");
          return json({ object: "response.input_tokens", input_tokens: 1_000 });
        case 2:
          expect(path).toBe("/v1/responses");
          return modelReply([{
            type: "function_call", id: "fc_actual_domain", call_id: "evaluate_actual_domain",
            status: "completed", name: "evaluate_scenario",
            arguments: JSON.stringify({ scenario: toAgentScenario(candidate) }),
          }], 100, 20);
        case 3:
          expect(path).toBe("/v1/responses/input_tokens");
          return json({ object: "response.input_tokens", input_tokens: 2_000 });
        case 4: {
          expect(path).toBe("/v1/responses");
          const items = body.input as Array<{ type?: string; call_id?: string; output?: string }>;
          const delivered = items.find(item => item.type === "function_call_output"
            && item.call_id === "evaluate_actual_domain");
          expect(delivered).toBeDefined();
          expect(JSON.parse(delivered!.output!)).toMatchObject({
            ok: true, scenarioId: "candidate-1", scenario: calculated.scenario,
            score: calculated.after.score, budget: calculated.budget,
            weakestDistrictScore: calculated.after.weakestDistrictScore,
          });
          return modelReply([{
            type: "message", id: "msg_selected", role: "assistant", status: "completed",
            content: [{ type: "output_text", annotations: [], text: JSON.stringify({ selectedScenarioId: selectedId }) }],
          }], 150, 25);
        }
        default:
          throw new Error("Unexpected extra HTTP call in bounded test");
      }
    });

    const result = await runLiveAgentCheck(input, policy());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error(`Expected completed mock-protocol run, got ${result.status}`);
    expect(result.source).toBe("openai-agent");
    expect(result.model).toBe("test-live-entry-model");
    expect(result.original).toEqual(original);
    expect(result.original.after.score).toBeCloseTo(56.54307, 8);
    expect(result.original.budget.spent).toBe(95);
    expect(result.recommended).toEqual(recommended);
    expect(result.selectedScenarioId).toBe(selectedId);
    expect(result.improved).toBe(calculated.after.score > original.after.score);
    expect(input).toEqual(example);
    expect(result.usage).toMatchObject({
      modelRequests: 2, toolCalls: 1, tokenCountRequests: 2, complete: true,
      inputTokens: 250, outputTokens: 45, totalTokens: 295,
    });
    expect(result.usage.responses).toHaveLength(2);
    expect(result.budget).toMatchObject({ reservedUsd: 0.15, remainingUsd: 0.85, estimatedUsd: 0.00385 });
    expect(result.journal).toMatchObject([{
      tool: "evaluate_scenario", callId: "evaluate_actual_domain", status: "evaluated",
      scenario: calculated.scenario, scenarioId: "candidate-1", score: calculated.after.score, budget: calculated.budget,
    }]);
    expect(outgoing.map(call => call.path)).toEqual([
      "/v1/responses/input_tokens", "/v1/responses", "/v1/responses/input_tokens", "/v1/responses",
    ]);
    expect(outgoing[2]?.body.input).toEqual(outgoing[3]?.body.input);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(Date.parse(result.finishedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
  });

  it("returns a labeled local fallback for a missing application key without any HTTP request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await runLiveAgentCheck(example, policy());
    expect(result).toMatchObject({
      status: "failed", source: "local-fallback", reason: "AI_NOT_CONFIGURED",
      original: evaluate(example), usage: null, budget: null, journal: [],
    });
    if (result.status !== "failed") throw new Error("Expected fallback result");
    expect(result.fallback.summary).toContain("Резервное объяснение без LLM");
    expect(result).not.toHaveProperty("recommended");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps cost unknown on a provider failure and never retries or starts another paid run", async () => {
    fetchMock.mockResolvedValueOnce(json({ object: "response.input_tokens", input_tokens: 1_000 }))
      .mockResolvedValueOnce(json({ error: { message: "private provider payload", type: "rate_limit_error" } }, 429));
    const result = await runLiveAgentCheck(example, policy());
    expect(result).toMatchObject({
      status: "failed", source: "local-fallback", reason: "PROVIDER_ERROR", original: evaluate(example),
      usage: { modelRequests: 1, tokenCountRequests: 1, complete: false, responses: [] },
      budget: { reservedUsd: 0.07, remainingUsd: 0.93, estimatedUsd: null }, journal: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("private provider payload");
    expect(result).not.toHaveProperty("recommended");
  });

  it("rejects an invalid original through the real engine before configuring or calling OpenAI", async () => {
    const result = await runLiveAgentCheck({ decisions: [] }, policy());
    expect(result).toMatchObject({ status: "invalid-scenario", modelRequests: 0 });
    if (result.status !== "invalid-scenario") throw new Error("Expected domain rejection");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "DECISION_COUNT" }));
    expect(result).not.toHaveProperty("original");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
