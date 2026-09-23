import "server-only";
import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import { dataset } from "@/data/dataset";
import type { Scenario, SimulationEngine, SimulationResult, ValidationIssue } from "@/domain/types";

const emptyArguments = z.strictObject({});
// Transport schema only. null means districtId is omitted before domain validation.
const candidateArguments = z.strictObject({
  scenario: z.strictObject({ decisions: z.array(z.strictObject({
    measureId: z.string().min(1).max(64),
    districtId: z.string().min(1).max(64).nullable(),
  })) }),
});
const compareArguments = z.strictObject({ leftId: z.string(), rightId: z.string() });

export const agentTools = [
  zodResponsesFunction({ name: "get_city_context", description: "Получить исходные районы, каталог, правила, веса, синергии и конфликты организаторов.", parameters: emptyArguments }),
  zodResponsesFunction({ name: "evaluate_scenario", description: "Проверить предложенный сценарий настоящим движком. Для городской меры districtId=null. При отказе вернуть причины без Score; исправь предложение. Порядок мер не важен.", parameters: candidateArguments }),
  zodResponsesFunction({ name: "compare_scenarios", description: "Сравнить два уже рассчитанных допустимых сценария по выданным сервером ID. Числа считает сервер.", parameters: compareArguments }),
];

export interface AgentJournalEntry {
  readonly tool: string;
  readonly callId: string;
  readonly status: "catalog" | "evaluated" | "invalid" | "cached" | "compared" | "error";
  readonly scenario?: unknown;
  readonly scenarioId?: string;
  readonly score?: number;
  readonly issues?: readonly ValidationIssue[];
  readonly error?: string;
}

type ToolReply = Record<string, unknown>;

function keyOf(scenario: { decisions: readonly { measureId: string; districtId?: string }[] }): string {
  return JSON.stringify(scenario.decisions.map(d => [d.measureId, d.districtId ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")));
}

function snapshot(id: string, result: SimulationResult) {
  return {
    scenarioId: id, scenario: result.scenario, budget: result.budget,
    score: result.after.score, weakestDistrictScore: result.after.weakestDistrictScore,
    criticalIndicators: result.after.criticalIndicators, districtDeltas: result.districtDeltas,
  };
}

/** Per-run state. No global registry, no duplicate business rules and no production mock. */
export class AgentToolSession {
  private readonly checked = new Map<string, SimulationResult>();
  private readonly cache = new Map<string, ToolReply>();
  readonly journal: AgentJournalEntry[] = [];
  candidateAttempts = 0;

  constructor(private readonly engine: SimulationEngine, original: SimulationResult) {
    const copy = structuredClone(original);
    this.checked.set("original", copy);
    this.cache.set(keyOf(copy.scenario), { ok: true, ...snapshot("original", copy) });
  }

  get validAlternatives(): number { return this.checked.size - 1; }

  getResult(id: string): SimulationResult | undefined {
    const result = this.checked.get(id);
    return result ? structuredClone(result) : undefined;
  }

  best(): { id: string; result: SimulationResult } {
    let bestId = "original";
    let bestResult = this.checked.get(bestId)!;
    for (const [id, result] of this.checked) {
      if (result.after.score > bestResult.after.score) { bestId = id; bestResult = result; }
    }
    return { id: bestId, result: structuredClone(bestResult) };
  }

  execute(name: string, rawArguments: string, callId: string): ToolReply {
    const fail = (code: string): ToolReply => {
      this.journal.push({ tool: agentTools.some(t => t.name === name) ? name : "unknown", callId, status: "error", error: code });
      return { ok: false, error: code };
    };
    if (!agentTools.some(t => t.name === name)) return fail("UNKNOWN_TOOL");
    let args: unknown;
    try { args = JSON.parse(rawArguments); } catch { return fail("INVALID_ARGUMENTS"); }

    if (name === "get_city_context") {
      if (!emptyArguments.safeParse(args).success) return fail("INVALID_ARGUMENTS");
      this.journal.push({ tool: name, callId, status: "catalog" });
      return { ok: true, dataset: structuredClone(dataset) };
    }
    if (name === "compare_scenarios") {
      const parsed = compareArguments.safeParse(args);
      if (!parsed.success) return fail("INVALID_ARGUMENTS");
      const left = this.checked.get(parsed.data.leftId);
      const right = this.checked.get(parsed.data.rightId);
      if (!left || !right) return fail("UNVERIFIED_SCENARIO");
      this.journal.push({ tool: name, callId, status: "compared" });
      return {
        ok: true, left: snapshot(parsed.data.leftId, left), right: snapshot(parsed.data.rightId, right),
        scoreDifference: right.after.score - left.after.score,
        costDifference: right.budget.spent - left.budget.spent,
        bestScenarioId: this.best().id,
      };
    }

    const parsed = candidateArguments.safeParse(args);
    if (!parsed.success) return fail("INVALID_ARGUMENTS");
    const candidate = { decisions: parsed.data.scenario.decisions.map(d => d.districtId === null
      ? { measureId: d.measureId } : { measureId: d.measureId, districtId: d.districtId }) };
    const key = keyOf(candidate);
    const cached = this.cache.get(key);
    if (cached) {
      this.journal.push({ tool: name, callId, status: "cached", scenario: structuredClone(candidate),
        ...(typeof cached.scenarioId === "string" ? { scenarioId: cached.scenarioId } : {}),
        ...(typeof cached.score === "number" ? { score: cached.score } : {}),
      });
      return structuredClone({ ...cached, cached: true });
    }

    this.candidateAttempts++;
    const evaluation = this.engine.evaluate(structuredClone(candidate));
    if (!evaluation.ok) {
      const reply = { ok: false, issues: structuredClone(evaluation.issues) };
      this.cache.set(key, reply);
      this.journal.push({ tool: name, callId, status: "invalid", scenario: structuredClone(candidate), issues: reply.issues });
      return structuredClone(reply);
    }
    const id = `candidate-${this.checked.size}`;
    const result = structuredClone(evaluation.result);
    this.checked.set(id, result);
    const reply = { ok: true, ...snapshot(id, result) };
    this.cache.set(key, reply);
    this.journal.push({ tool: name, callId, status: "evaluated", scenario: result.scenario, scenarioId: id, score: result.after.score });
    return structuredClone(reply);
  }
}

/** Serialize game decisions for the strict tool schema without changing the shared Scenario. */
export function toAgentScenario(scenario: Scenario) {
  return { decisions: scenario.decisions.map(d => ({ measureId: d.measureId, districtId: d.districtId ?? null })) };
}
