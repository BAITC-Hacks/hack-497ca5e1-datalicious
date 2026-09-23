// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./openai", () => ({ createOpenAIContext: vi.fn() }));

import { createOpenAIContext } from "./openai";
import { analyzeScenario, analysisService } from "./analyze";
import { AnalysisError } from "./analysis-error";
import { analysisFixture, createResultFixture, deepFreeze } from "./__tests__/fixtures";

const parse = vi.fn();

beforeEach(() => {
  parse.mockReset().mockResolvedValue({
    status: "completed", output: [], output_parsed: analysisFixture, error: null,
  });
  vi.mocked(createOpenAIContext).mockReset().mockReturnValue({
    client: { responses: { parse } } as unknown as ReturnType<typeof createOpenAIContext>["client"],
    model: "test-model",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("AI analysis service (mock SDK, no paid requests)", () => {
  it("passes server-calculated facts and source labels, requests structured output, and preserves inputs", async () => {
    const result = deepFreeze(createResultFixture());
    const before = JSON.stringify(result);
    expect(await analysisService.analyze(result)).toEqual(analysisFixture);
    const request = parse.mock.calls[0]?.[0];
    expect(request).toMatchObject({ model: "test-model", store: false, max_output_tokens: 4_000 });
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(request.instructions).toContain("Не вычисляй Score");
    expect(request.instructions).toContain("НЕ аддитивные вклады");
    expect(request.instructions).toContain("не предлагай шестое решение");
    const input = JSON.parse(request.input[0].content);
    expect(input.result).toEqual(result);
    expect(input.reference.districts).toContainEqual({ id: "nura", name: "Нура" });
    expect(input.reference.measures).toHaveLength(14);
    expect(JSON.stringify(result)).toBe(before);
  });

  it.each([
    ["empty", null],
    ["missing fields", { summary: "Итог" }],
    ["wrong field type", { ...analysisFixture, risks: "нет" }],
    ["blank text", { ...analysisFixture, summary: "   " }],
    ["invented score field", { ...analysisFixture, finalScore: 100 }],
  ])("rejects %s output", async (_name, output) => {
    parse.mockResolvedValue({ status: "completed", output: [], output_parsed: output });
    await expect(analyzeScenario(createResultFixture())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it.each(["incomplete", "failed", "cancelled", "queued", "in_progress"])("rejects %s responses", async status => {
    parse.mockResolvedValue({ status, output: [], output_parsed: analysisFixture });
    await expect(analyzeScenario(createResultFixture())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("rejects refusal even if parsed content is also present", async () => {
    parse.mockResolvedValue({
      status: "completed", output_parsed: analysisFixture,
      output: [{ type: "message", content: [{ type: "refusal", refusal: "provider detail" }] }],
    });
    await expect(analyzeScenario(createResultFixture())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it.each(["APIConnectionTimeoutError", "RateLimitError", "SyntaxError"])("sanitizes %s without silently falling back", async name => {
    const raw = Object.assign(new Error("secret-key provider payload"), { name });
    parse.mockRejectedValue(raw);
    try {
      await analyzeScenario(createResultFixture());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisError);
      expect(error).toMatchObject({ code: "AI_UNAVAILABLE" });
      expect(String(error)).not.toContain("secret-key");
      expect(error).not.toHaveProperty("cause");
    }
  });

  it("does not call the SDK without configuration", async () => {
    vi.mocked(createOpenAIContext).mockImplementation(() => { throw new Error("AI_NOT_CONFIGURED"); });
    await expect(analyzeScenario(createResultFixture())).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("does not leak unexpected SDK initialization errors", async () => {
    vi.mocked(createOpenAIContext).mockImplementation(() => { throw new Error("secret-key via SDK"); });
    await expect(analyzeScenario(createResultFixture())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
