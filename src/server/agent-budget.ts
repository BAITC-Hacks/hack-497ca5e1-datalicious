import "server-only";
import { z } from "zod";
import type { ResponseUsage } from "openai/resources/responses/responses";

/** Server-owned policy, never accepted from a browser or tool arguments. No default tariff. */
const policySchema = z.strictObject({
  maxUsd: z.number().positive().max(1),
  maxInputTokens: z.number().int().positive().max(16_000),
  pricing: z.strictObject({
    model: z.string().trim().min(1),
    inputUsdPerMillion: z.number().positive(),
    outputUsdPerMillion: z.number().positive(),
    verifiedAt: z.iso.datetime(),
    source: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password
        && ["developers.openai.com", "platform.openai.com"].includes(url.hostname);
    }),
  }),
});

export type AgentBudgetPolicy = z.infer<typeof policySchema>;
export type BudgetStopReason = "INVALID_BUDGET_POLICY" | "MODEL_PRICE_MISMATCH" | "BUDGET_LIMIT"
  | "INPUT_TOKEN_LIMIT" | "USAGE_UNKNOWN" | "USAGE_LIMIT_MISMATCH" | "SERVICE_TIER_MISMATCH";

export class AgentBudgetError extends Error {
  constructor(readonly reason: BudgetStopReason) { super(reason); }
}

export function validateAgentBudgetPolicy(policy: unknown): AgentBudgetPolicy {
  const parsed = policySchema.safeParse(policy);
  if (!parsed.success) throw new AgentBudgetError("INVALID_BUDGET_POLICY");
  const age = Date.now() - Date.parse(parsed.data.pricing.verifiedAt);
  if (age < 0 || age > 24 * 60 * 60 * 1_000) throw new AgentBudgetError("INVALID_BUDGET_POLICY");
  return Object.freeze({ ...parsed.data, pricing: Object.freeze(parsed.data.pricing) });
}

export function hasReliableTokenUsage(usage: ResponseUsage | null | undefined): usage is ResponseUsage {
  return Boolean(usage && [usage.input_tokens, usage.output_tokens, usage.total_tokens]
    .every(n => Number.isSafeInteger(n) && n >= 0)
    && usage.total_tokens === usage.input_tokens + usage.output_tokens);
}

export interface AgentBudgetSnapshot {
  readonly maxUsd: number;
  /** Worst-case reservations are NEVER refunded, even after a smaller response or network error. */
  readonly reservedUsd: number;
  readonly remainingUsd: number;
  /** Conservative estimate at uncached input rates; null if any dispatched request lacks reliable usage. */
  readonly estimatedUsd: number | null;
  readonly pricing: AgentBudgetPolicy["pricing"];
}

/** Integer nanodollars, rounded up per request. This is a spending guard, not a billing receipt. */
export class AgentBudget {
  readonly policy: AgentBudgetPolicy;
  private readonly ceiling: number;
  private readonly reservations: Array<{ input: number; output: number; reported: number | null }> = [];
  private reserved = 0;

  constructor(policy: AgentBudgetPolicy, model: string) {
    this.policy = validateAgentBudgetPolicy(policy);
    if (this.policy.pricing.model !== model) throw new AgentBudgetError("MODEL_PRICE_MISMATCH");
    this.ceiling = Math.floor(this.policy.maxUsd * 1e9);
  }

  private cost(input: number, output: number): number {
    const rate = this.policy.pricing;
    return Math.ceil((input * rate.inputUsdPerMillion + output * rate.outputUsdPerMillion) * 1_000);
  }

  reserve(input: number, output: number): void {
    if (!Number.isSafeInteger(input) || input < 0 || input > this.policy.maxInputTokens) {
      throw new AgentBudgetError("INPUT_TOKEN_LIMIT");
    }
    if (!Number.isSafeInteger(output) || output < 1 || output > 2_000) {
      throw new AgentBudgetError("INVALID_BUDGET_POLICY");
    }
    const charge = this.cost(input, output);
    if (!Number.isSafeInteger(charge) || this.reserved + charge > this.ceiling) {
      throw new AgentBudgetError("BUDGET_LIMIT");
    }
    this.reserved += charge;
    this.reservations.push({ input, output, reported: null });
  }

  settle(usage: ResponseUsage | null | undefined, tier?: string | null): void {
    const reservation = this.reservations.at(-1);
    if (!reservation || reservation.reported !== null) throw new AgentBudgetError("INVALID_BUDGET_POLICY");
    if (tier && tier !== "default") throw new AgentBudgetError("SERVICE_TIER_MISMATCH");
    if (!usage) throw new AgentBudgetError("USAGE_UNKNOWN");
    if (!hasReliableTokenUsage(usage) || usage.input_tokens > reservation.input || usage.output_tokens > reservation.output) {
      throw new AgentBudgetError("USAGE_LIMIT_MISMATCH");
    }
    reservation.reported = this.cost(usage.input_tokens, usage.output_tokens);
  }

  snapshot(): AgentBudgetSnapshot {
    return {
      maxUsd: this.ceiling / 1e9, reservedUsd: this.reserved / 1e9,
      remainingUsd: (this.ceiling - this.reserved) / 1e9,
      estimatedUsd: this.reservations.some(item => item.reported === null) ? null
        : this.reservations.reduce((sum, item) => sum + item.reported!, 0) / 1e9,
      pricing: structuredClone(this.policy.pricing),
    };
  }
}

export function isOfficialOpenAIEndpoint(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return url.protocol === "https:" && url.hostname === "api.openai.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && ["/v1", "/v1/"].includes(url.pathname);
  } catch { return false; }
}
