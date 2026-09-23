// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SimulationEngine } from "@/domain/types";
import { createAgentAnalysisService, runScenarioAgent } from "./agent";
import { toAgentScenario } from "./agent-tools";
import { createAnalyzeHandler } from "./analyze-handler";
import { createResultFixture } from "./__tests__/fixtures";

const fetchMock = vi.fn<typeof fetch>();
const evaluate = vi.fn<SimulationEngine["evaluate"]>();
const engine: SimulationEngine = { evaluate, baseline: vi.fn(), validate: vi.fn() };
const handler = createAnalyzeHandler({ engine, analysis: createAgentAnalysisService(engine) });
const request = () => new Request("http://localhost/api/analyze", {
  method: "POST", body: JSON.stringify({ scenario: createResultFixture().scenario }),
});

const reply = (output: unknown[], usage: unknown = null) => new Response(JSON.stringify({
  id: "resp_test", object: "response", created_at: 1, status: "completed", error: null, output, usage,
}), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  fetchMock.mockReset().mockRejectedValue(new Error("Unexpected network access in test"));
  evaluate.mockReset().mockReturnValue({ ok: true, result: createResultFixture() });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("agent with installed SDK and fully mocked HTTP; no live domain or paid calls", () => {
  it("sends Responses function schemas and replays call IDs/results through the real SDK", async () => {
    // Protocol-only score fixture, not a calculated assertion about this scenario.
    const original = createResultFixture();
    const alternative = {
      ...original,
      scenario: { decisions: original.scenario.decisions.map(d => d.measureId === "M5"
        ? { ...d, districtId: "almaty" as const } : d) },
      after: { ...original.after, score: 60 },
    };
    evaluate.mockReturnValueOnce({ ok: true, result: original }).mockReturnValueOnce({ ok: true, result: alternative });
    fetchMock.mockResolvedValueOnce(reply([{
      type: "function_call", id: "fc_test", call_id: "call_test", status: "completed",
      name: "evaluate_scenario", arguments: JSON.stringify({ scenario: toAgentScenario(alternative.scenario) }),
    }])).mockResolvedValueOnce(reply([{
      type: "message", id: "msg_test", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: '{"selectedScenarioId":"candidate-1"}', annotations: [] }],
    }]));

    const response = await handler(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result).toEqual(original);
    expect(payload.analysis.recommendations.join(" ")).toContain("Score альтернативы: 60");
    expect(payload).not.toHaveProperty("usage");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenNthCalledWith(2, alternative.scenario);
    const bodies = await Promise.all(fetchMock.mock.calls.map(async ([url, init]) => {
      const outgoing = new Request(url, init);
      expect(new URL(outgoing.url).pathname).toBe("/v1/responses");
      return outgoing.json();
    }));
    expect(bodies[0]).toMatchObject({ model: "test-model", max_output_tokens: 2000,
      tool_choice: "required", parallel_tool_calls: false, store: false });
    expect(bodies[0].tools.map((t: { name: string }) => t.name)).toEqual([
      "get_city_context", "evaluate_scenario", "compare_scenarios",
    ]);
    for (const tool of bodies[0].tools) {
      expect(tool).toMatchObject({ type: "function", strict: true, parameters: { additionalProperties: false } });
      expect(tool).not.toHaveProperty("function"); // Responses, not Chat Completions shape.
    }
    expect(bodies[0].text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(bodies[1].tool_choice).toBe("auto");
    const toolOutput = bodies[1].input.find((item: { type: string }) => item.type === "function_call_output");
    expect(toolOutput.call_id).toBe("call_test");
    expect(JSON.parse(toolOutput.output)).toMatchObject({ ok: true, scenarioId: "candidate-1", score: 60 });
  });

  it("disables factory retries for this agent even on a retryable HTTP 429", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      error: { message: "private provider detail", type: "rate_limit_error" },
    }), { status: 429, headers: { "Content-Type": "application/json", "retry-after-ms": "1" } }));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_UNAVAILABLE" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects the original scenario before any OpenAI request", async () => {
    evaluate.mockReturnValue({ ok: false, issues: [{ code: "BUDGET_EXCEEDED", message: "Бюджет превышен." }] });
    const response = await handler(request());
    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 with a missing model without a provider call or fake agent success", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records unavailable usage as null, not as evidence of zero provider cost", async () => {
    fetchMock.mockResolvedValueOnce(reply([{
      type: "message", id: "msg_test", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: '{"selectedScenarioId":"original"}', annotations: [] }],
    }]));
    await expect(runScenarioAgent(createResultFixture(), engine)).rejects.toMatchObject({
      reason: "NO_SEARCH", usage: { modelRequests: 1, responses: [{ request: 1, usage: null }] },
    });
  });
});
