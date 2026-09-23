// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ResponseUsage } from "openai/resources/responses/responses";
import { AgentBudget, isOfficialOpenAIEndpoint, type AgentBudgetPolicy } from "./agent-budget";

const checkedAt = "2026-09-23T12:00:00.000Z";

/** Artificial tariff for arithmetic/guard tests ONLY; not a real or current model price. */
function policy(): AgentBudgetPolicy {
  return {
    maxUsd: 1,
    maxInputTokens: 16_000,
    pricing: {
      model: "test-priced-model",
      inputUsdPerMillion: 10,
      outputUsdPerMillion: 30,
      verifiedAt: checkedAt,
      source: "https://developers.openai.com/api/docs/pricing",
    },
  };
}

function reported(input: number, output: number): ResponseUsage {
  return {
    input_tokens: input, output_tokens: output, total_tokens: input + output,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(checkedAt)); });
afterEach(() => vi.useRealTimers());

describe("agent budget guard with artificial tariff fixtures; no provider calls", () => {
  it("blocks a reservation that would exceed the cumulative limit, without adding a reservation", () => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    for (let index = 0; index < 4; index++) {
      budget.reserve(16_000, 2_000); // Artificial rates: $0.22 worst case per request.
      budget.settle(reported(100, 10), "default");
    }
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.88, remainingUsd: 0.12, estimatedUsd: 0.0052 });
    const before = budget.snapshot();
    expect(() => budget.reserve(16_000, 2_000)).toThrow("BUDGET_LIMIT");
    expect(budget.snapshot()).toEqual(before);
  });

  it("never refunds reservations after smaller responses or an unreported failed request", () => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    budget.reserve(16_000, 2_000);
    budget.settle(reported(1, 1));
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.22, remainingUsd: 0.78, estimatedUsd: 0.00004 });
    budget.reserve(16_000, 2_000);
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.44, remainingUsd: 0.56, estimatedUsd: null });
  });

  it.each([null, undefined])("does not call missing usage %s zero spend or release its reservation", missing => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    budget.reserve(1_000, 100);
    expect(() => budget.settle(missing)).toThrow("USAGE_UNKNOWN");
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.013, remainingUsd: 0.987, estimatedUsd: null });
  });

  it.each([-1, 0.5, 16_001, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe/over-cap input count %s before reserving", input => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    expect(() => budget.reserve(input, 100)).toThrow("INPUT_TOKEN_LIMIT");
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0, remainingUsd: 1, estimatedUsd: 0 });
  });

  it("enforces a configured input cap below the hard ceiling", () => {
    const budget = new AgentBudget({ ...policy(), maxInputTokens: 1_000 }, "test-priced-model");
    expect(() => budget.reserve(1_001, 100)).toThrow("INPUT_TOKEN_LIMIT");
    budget.reserve(1_000, 100);
    expect(budget.snapshot().reservedUsd).toBe(0.013);
  });

  it.each([0, -1, 2_001, 0.5, NaN, Infinity])("rejects invalid/over-cap output count %s", output => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    expect(() => budget.reserve(100, output)).toThrow("INVALID_BUDGET_POLICY");
  });

  it.each([
    { maxUsd: 1.01 }, { maxUsd: 0 }, { maxUsd: -1 }, { maxUsd: Infinity },
    { maxInputTokens: 16_001 }, { maxInputTokens: 0 }, { maxInputTokens: 1.5 },
  ])("rejects invalid budget bounds %j", overrides => {
    expect(() => new AgentBudget({ ...policy(), ...overrides }, "test-priced-model")).toThrow("INVALID_BUDGET_POLICY");
  });

  it.each([
    { inputUsdPerMillion: 0 }, { inputUsdPerMillion: -1 }, { inputUsdPerMillion: NaN },
    { outputUsdPerMillion: 0 }, { outputUsdPerMillion: Infinity },
    { model: " " }, { verifiedAt: "not-a-date" },
    { source: "https://unapproved.example/pricing" },
    { source: "http://developers.openai.com/api/docs/pricing" },
    { source: "https://username:password@developers.openai.com/api/docs/pricing" },
  ])("rejects invalid tariff metadata %j", overrides => {
    const selected = policy();
    expect(() => new AgentBudget({ ...selected, pricing: { ...selected.pricing, ...overrides } }, "test-priced-model"))
      .toThrow("INVALID_BUDGET_POLICY");
  });

  it.each(["2026-09-23T12:00:00.001Z", "2026-09-22T11:59:59.999Z"])("rejects future or stale tariff verification %s", verifiedAt => {
    const selected = policy();
    expect(() => new AgentBudget({ ...selected, pricing: { ...selected.pricing, verifiedAt } }, "test-priced-model"))
      .toThrow("INVALID_BUDGET_POLICY");
  });

  it("does not apply a tariff to a different model", () => {
    expect(() => new AgentBudget(policy(), "different-model")).toThrow("MODEL_PRICE_MISMATCH");
  });

  it.each(["priority", "flex", "scale", "auto"])("rejects a returned service tier %s not covered by its default tariff", tier => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    budget.reserve(1_000, 100);
    expect(() => budget.settle(reported(100, 10), tier)).toThrow("SERVICE_TIER_MISMATCH");
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.013, estimatedUsd: null });
  });

  it.each([
    { input_tokens: -1 }, { output_tokens: -1 }, { total_tokens: -1 },
    { input_tokens: 0.5 }, { output_tokens: NaN }, { total_tokens: Infinity },
    { input_tokens: 1_001, total_tokens: 1_011 },
    { output_tokens: 101, total_tokens: 201 },
    { total_tokens: 111 },
  ])("rejects inconsistent/over-reservation usage %j without claiming known cost", overrides => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    budget.reserve(1_000, 100);
    expect(() => budget.settle({ ...reported(100, 10), ...overrides })).toThrow("USAGE_LIMIT_MISMATCH");
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.013, estimatedUsd: null });
  });

  it("rejects settlement without a pending request or repeated settlement", () => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    expect(() => budget.settle(reported(0, 0))).toThrow("INVALID_BUDGET_POLICY");
    budget.reserve(100, 10);
    budget.settle(reported(0, 0), "default");
    expect(() => budget.settle(reported(0, 0))).toThrow("INVALID_BUDGET_POLICY");
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.0013, estimatedUsd: 0 });
  });

  it("copies input metadata and returned snapshots instead of exposing those references", () => {
    const selected = policy();
    const budget = new AgentBudget(selected, "test-priced-model");
    selected.pricing.inputUsdPerMillion = 999;
    const first = budget.snapshot();
    first.pricing.outputUsdPerMillion = 999;
    budget.reserve(1_000, 100);
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0.013, pricing: policy().pricing });
  });

  it("freezes the validated policy against mutation during the run", () => {
    const budget = new AgentBudget(policy(), "test-priced-model");
    expect(() => { budget.policy.pricing.inputUsdPerMillion = 0; }).toThrow();
    expect(() => { budget.policy.maxUsd = 999; }).toThrow();
    budget.reserve(1_000, 100);
    expect(budget.snapshot().reservedUsd).toBe(0.013);
  });
});

describe("approved Responses endpoint allowlist", () => {
  it.each(["https://api.openai.com/v1", "https://api.openai.com/v1/"])("accepts official endpoint %s", endpoint => {
    expect(isOfficialOpenAIEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "https://unknown.example/v1", "https://api.openai.com.attacker.example/v1",
    "https://sub.api.openai.com/v1", "https://127.0.0.1/v1", "http://api.openai.com/v1",
    "https://username@api.openai.com/v1", "https://username:password@api.openai.com/v1",
    "https://api.openai.com/v1?target=elsewhere", "https://api.openai.com/v1#fragment",
    "https://api.openai.com/v2", "https://api.openai.com/v1/responses", "https://api.openai.com/",
    "https://api.openai.com:8443/v1", "/v1", "not-a-url", "",
  ])("rejects unapproved endpoint %s", endpoint => {
    expect(isOfficialOpenAIEndpoint(endpoint)).toBe(false);
  });
});
