// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SimulationEngine, SimulationResult, ValidationIssue } from "@/domain/types";
import { AgentToolSession, toAgentScenario } from "./agent-tools";
import { createResultFixture, deepFreeze, invalidEvaluation } from "./__tests__/fixtures";

// Protocol fixture only: these altered numbers are not domain regression expectations.
function alternative(): SimulationResult {
  const original = createResultFixture();
  return {
    ...original,
    scenario: { decisions: original.scenario.decisions.map(d => d.measureId === "M5"
      ? { ...d, districtId: "almaty" as const } : d) },
    budget: { spent: 90, remaining: 10 },
    after: { ...original.after, score: 60 },
  };
}

function createSession() {
  const original = deepFreeze(createResultFixture());
  const evaluate = vi.fn<SimulationEngine["evaluate"]>();
  const engine: SimulationEngine = { evaluate, validate: vi.fn(), baseline: vi.fn() };
  return { original, evaluate, session: new AgentToolSession(engine, original) };
}

describe("agent tool evidence (domain doubles, no provider calls)", () => {
  it("records only verified comparison IDs and domain-derived numbers with evaluated budgets", () => {
    const { original, evaluate, session } = createSession();
    const candidate = deepFreeze(alternative());
    evaluate.mockReturnValue({ ok: true, result: candidate });
    session.execute("evaluate_scenario", JSON.stringify({ scenario: toAgentScenario(candidate.scenario) }), "evaluate");
    const comparison = session.execute("compare_scenarios", JSON.stringify({ leftId: "original", rightId: "candidate-1" }), "compare");

    expect(session.journal[0]).toMatchObject({
      tool: "evaluate_scenario", callId: "evaluate", status: "evaluated", scenario: candidate.scenario,
      scenarioId: "candidate-1", score: candidate.after.score, budget: candidate.budget,
    });
    expect(session.journal[1]).toEqual({
      tool: "compare_scenarios", callId: "compare", status: "compared",
      comparison: {
        leftId: "original", rightId: "candidate-1", leftScore: original.after.score,
        rightScore: candidate.after.score, scoreDifference: candidate.after.score - original.after.score,
        costDifference: candidate.budget.spent - original.budget.spent, bestScenarioId: "candidate-1",
      },
    });
    expect(comparison).toMatchObject({
      scoreDifference: session.journal[1]?.comparison?.scoreDifference,
      costDifference: session.journal[1]?.comparison?.costDifference,
      bestScenarioId: "candidate-1",
    });
    expect(original).toEqual(createResultFixture());
    expect(candidate).toEqual(alternative());
  });

  it("preserves validation issues for cached invalid candidates without scores or reevaluation", () => {
    const { evaluate, session } = createSession();
    const issues: ValidationIssue[] = [{ code: "BUDGET_EXCEEDED", message: "Бюджет превышен.", decisionIndexes: [0] }];
    evaluate.mockReturnValue(invalidEvaluation(deepFreeze(issues)));
    const args = JSON.stringify({ scenario: toAgentScenario(alternative().scenario) });
    const first = session.execute("evaluate_scenario", args, "invalid");
    // A caller mutating a tool reply must not corrupt the cached result or journal.
    (first.issues as Array<{ message: string }>)[0]!.message = "changed reply";
    const second = session.execute("evaluate_scenario", args, "cached-invalid");

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ ok: false, issues, cached: true });
    expect(session.journal[1]).toMatchObject({ status: "cached", issues });
    expect(session.journal[0]?.issues).toEqual(issues);
    for (const entry of session.journal) {
      expect(entry).not.toHaveProperty("score");
      expect(entry).not.toHaveProperty("scenarioId");
      expect(entry).not.toHaveProperty("budget");
    }
    expect(session.candidateAttempts).toBe(1);
    expect(session.validAlternatives).toBe(0);
  });

  it("retains cached valid budgets and isolates comparison replies from verified registry state", () => {
    const { original, evaluate, session } = createSession();
    const candidate = deepFreeze(alternative());
    evaluate.mockReturnValue({ ok: true, result: candidate });
    session.execute("evaluate_scenario", JSON.stringify({ scenario: toAgentScenario(candidate.scenario) }), "evaluate");
    const reply = session.execute("compare_scenarios", JSON.stringify({ leftId: "original", rightId: "candidate-1" }), "compare");
    const exposed = reply.right as {
      scenario: { decisions: Array<{ measureId: string; districtId?: string }> };
      budget: { spent: number };
      districtDeltas: Array<{ score: number }>;
    };
    exposed.scenario.decisions[0]!.measureId = "tampered";
    exposed.budget.spent = -100;
    exposed.districtDeltas[0]!.score = 999;
    const duplicate = session.execute("evaluate_scenario", JSON.stringify({
      scenario: toAgentScenario({ decisions: [...candidate.scenario.decisions].reverse() }),
    }), "cached-valid");

    expect(session.getResult("candidate-1")).toEqual(candidate);
    expect(session.best().result).toEqual(candidate);
    expect(duplicate).toMatchObject({ ok: true, cached: true, budget: candidate.budget, score: candidate.after.score });
    expect(session.journal[2]).toMatchObject({ status: "cached", scenarioId: "candidate-1", budget: candidate.budget });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(original).toEqual(createResultFixture());
    expect(candidate).toEqual(alternative());
  });

  it("does not retain unknown tool names, arbitrary arguments or invented comparison IDs", () => {
    const { evaluate, session } = createSession();
    const rejected = session.execute("untrusted-tool-detail", '{"reasoning":"private supplied text"}', "unknown");
    const comparison = session.execute("compare_scenarios", JSON.stringify({ leftId: "original", rightId: "invented" }), "unverified");

    expect(rejected).toEqual({ ok: false, error: "UNKNOWN_TOOL" });
    expect(comparison).toEqual({ ok: false, error: "UNVERIFIED_SCENARIO" });
    expect(session.journal).toEqual([
      { tool: "unknown", callId: "unknown", status: "error", error: "UNKNOWN_TOOL" },
      { tool: "compare_scenarios", callId: "unverified", status: "error", error: "UNVERIFIED_SCENARIO" },
    ]);
    expect(JSON.stringify(session.journal)).not.toMatch(/untrusted-tool-detail|private supplied text|reasoning|invented/);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
