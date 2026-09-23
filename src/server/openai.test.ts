// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createOpenAIContext } from "./openai";
import type { SimulationEngine } from "@/domain/types";
import { analysisService } from "./analyze";
import { createAnalyzeHandler } from "./analyze-handler";
import { analysisFixture, createResultFixture } from "./__tests__/fixtures";

const fetchMock = vi.fn<typeof fetch>();

// This composition exercises real server components, but NOT participant 1's engine.
const engine: SimulationEngine = {
  evaluate: () => ({ ok: true, result: createResultFixture() }),
  validate: vi.fn(),
  baseline: vi.fn(),
};
const handle = createAnalyzeHandler({ engine, analysis: analysisService });
const request = () => new Request("http://localhost/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scenario: createResultFixture().scenario }),
});

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  fetchMock.mockReset().mockRejectedValue(new Error("Unexpected network access in test"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("existing OpenAI factory and real SDK with mocked HTTP transport", () => {
  it("constructs the SDK lazily with bounded requests and no request on construction", () => {
    const context = createOpenAIContext();
    expect(context.model).toBe("test-model");
    expect(context.client.timeout).toBe(20_000);
    expect(context.client.maxRetries).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["OPENAI_API_KEY", undefined], ["OPENAI_API_KEY", "   "],
    ["OPENAI_MODEL", undefined], ["OPENAI_MODEL", ""],
  ] as const)("rejects missing/blank %s", (key, value) => {
    vi.stubEnv(key, value);
    expect(createOpenAIContext).toThrow("AI_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("composes HTTP handler, real analysis service and installed SDK with domain/HTTP doubles", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: "resp_test", object: "response", created_at: 1, status: "completed", error: null,
      output: [{
        id: "msg_test", type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(analysisFixture), annotations: [] }],
      }],
    }), { headers: { "Content-Type": "application/json" } }));

    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: createResultFixture(), analysis: analysisFixture, source: "agent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("Expected mocked transport call");
    const providerRequest = new Request(call[0], call[1]);
    expect(new URL(providerRequest.url).pathname).toBe("/v1/responses");
    expect(providerRequest.method).toBe("POST");
    const body = await providerRequest.json();
    expect(body).toMatchObject({ model: "test-model", store: false });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.text.format.schema.required).toEqual([
      "summary", "strengths", "risks", "consequences", "recommendations",
    ]);
  });

  it("maps real factory configuration failure to 503 without sending a provider request", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    const response = await handle(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["refusal", "invalid JSON"])("maps SDK %s to 502 without substituting a successful fallback", async kind => {
    const content = kind === "refusal"
      ? { type: "refusal", refusal: "private provider detail" }
      : { type: "output_text", text: "{", annotations: [] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: "resp_test", object: "response", status: "completed", error: null,
      output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [content] }],
    }), { headers: { "Content-Type": "application/json" } }));
    const response = await handle(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "AI_UNAVAILABLE" } });
    expect(body).not.toHaveProperty("analysis");
    expect(JSON.stringify(body)).not.toContain("private provider detail");
  });

  it("sanitizes an actual SDK HTTP error without logging or exposing provider data", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: { message: "private provider detail secret-key", type: "authentication_error", code: "invalid_api_key" },
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    const response = await handle(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
