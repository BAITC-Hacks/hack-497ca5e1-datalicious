// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { simulationEngine } from "@/domain";
import { exampleDecisions } from "@/data/dataset";
import { toAgentScenario } from "@/server/agent-tools";

const fetchMock = vi.fn<typeof fetch>();
const request = (scenario: unknown) => new Request("http://localhost/api/analyze", {
  method: "POST", body: JSON.stringify({ scenario }),
});

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_MODEL", "");
  fetchMock.mockReset().mockRejectedValue(new Error("Unexpected network access"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("production route with real engine; no live provider", () => {
  it("returns 503 for a valid scenario without configuration, not 501 or fake success", async () => {
    const response = await POST(request({ decisions: exampleDecisions }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ decisions: [] }, "DECISION_COUNT"],
    [{ decisions: [
      { measureId: "M3", districtId: "nura" }, { measureId: "M5", districtId: "saryarka" },
      { measureId: "M7", districtId: "esil" }, { measureId: "M8", districtId: "nura" }, { measureId: "M12" },
    ] }, "BUDGET_EXCEEDED"],
  ])("rejects a genuinely invalid scenario before OpenAI (%s)", async (scenario, code) => {
    const response = await POST(request(scenario));
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.issues).toContainEqual(expect.objectContaining({ code }));
    expect(payload).not.toHaveProperty("result");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("composes the real engine, agent and SDK with only the HTTP provider mocked", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key"); vi.stubEnv("OPENAI_MODEL", "test-model");
    const alternative = { decisions: exampleDecisions.map(d => d.measureId === "M5"
      ? { ...d, districtId: "nura" as const } : d) };
    const original = simulationEngine.evaluate({ decisions: exampleDecisions });
    const evaluated = simulationEngine.evaluate(alternative);
    if (!original.ok || !evaluated.ok) throw new Error("Real organizer scenarios must be valid");
    const selectedId = evaluated.result.after.score > original.result.after.score ? "candidate-1" : "original";
    fetchMock.mockResolvedValueOnce(Response.json({ id: "resp_tool", object: "response", status: "completed", output: [{
      type: "function_call", id: "fc_test", call_id: "call_test", name: "evaluate_scenario",
      arguments: JSON.stringify({ scenario: toAgentScenario(alternative) }),
    }] })).mockImplementationOnce(async (url, init) => {
      const body = await new Request(url, init).json();
      const output = body.input.find((item: { type: string }) => item.type === "function_call_output");
      expect(JSON.parse(output.output)).toMatchObject({ scenarioId: "candidate-1", score: evaluated.result.after.score });
      return Response.json({ id: "resp_final", object: "response", status: "completed", output: [{
        type: "message", id: "msg_test", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ selectedScenarioId: selectedId }), annotations: [] }],
      }] });
    });
    const response = await POST(request({ decisions: exampleDecisions }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result).toEqual(original.result);
    expect(payload.result.budget.spent).toBe(95);
    expect(payload.result.baseline.score).toBeCloseTo(52.55768, 5);
    expect(payload.result.after.score).toBeCloseTo(56.54307, 5);
    expect(payload.analysis.summary).toContain("Поиск AI-агента завершён");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
