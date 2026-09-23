import "server-only";
import { simulationEngine } from "@/domain";
import type { Scenario } from "@/domain/types";
import { AgentSearchError, runScenarioAgent } from "./agent";
import { AgentBudgetError, validateAgentBudgetPolicy } from "./agent-budget";
import { createFallbackAnalysis } from "./fallback";
import { AnalysisError } from "./analysis-error";

/**
 * Explicit manual entry point. Never called by npm test, build, CI or the public route.
 * The caller must verify the current price for OPENAI_MODEL and supply a fresh policy.
 * Uses the real imported engine; there is no engine/provider injection here.
 * A failed run is returned once, never automatically retried.
 */
export async function runLiveAgentCheck(scenario: Scenario, policy: unknown) {
  const startedAt = new Date().toISOString();
  const original = simulationEngine.evaluate(scenario);
  if (!original.ok) {
    return { status: "invalid-scenario" as const, startedAt, issues: original.issues, modelRequests: 0 };
  }
  let model: string | null = null;
  try {
    // TypeScript annotations cannot guard an explicit manual JavaScript invocation.
    const verifiedPolicy = validateAgentBudgetPolicy(policy);
    model = verifiedPolicy.pricing.model;
    const result = await runScenarioAgent(original.result, simulationEngine, { budget: verifiedPolicy });
    return {
      status: "completed" as const, source: "openai-agent" as const,
      startedAt, finishedAt: new Date().toISOString(), model,
      original: original.result, recommended: result.bestResult, selectedScenarioId: result.bestScenarioId,
      improved: result.improved, analysis: result.analysis, journal: result.journal,
      usage: result.usage, budget: result.budget,
    };
  } catch (error) {
    const diagnostic = error instanceof AgentSearchError ? error : null;
    return {
      status: "failed" as const, source: "local-fallback" as const,
      startedAt, finishedAt: new Date().toISOString(), model,
      original: original.result, fallback: createFallbackAnalysis(original.result),
      reason: diagnostic?.reason ?? (error instanceof AgentBudgetError ? error.reason
        : error instanceof AnalysisError ? error.code : "INTERNAL_ERROR"),
      // Null is unknown/unavailable, not zero tokens or confirmed zero cost.
      journal: diagnostic?.journal ?? [], usage: diagnostic?.usage ?? null, budget: diagnostic?.budget ?? null,
    };
  }
}
