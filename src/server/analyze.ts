import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { AiAnalysis, AnalysisService, SimulationResult } from "@/domain/types";
import { createOpenAIContext } from "./openai";
import { AnalysisError } from "./analysis-error";
import { analysisInstructions, buildAnalysisInput } from "./analysis-prompt";
import { aiAnalysisSchema } from "./analysis-schema";

/** No SDK construction or requests at import time. Never silently substitutes fallback. */
export async function analyzeScenario(result: SimulationResult): Promise<AiAnalysis> {
  const input = buildAnalysisInput(result);
  let context: ReturnType<typeof createOpenAIContext>;
  try {
    context = createOpenAIContext();
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      throw new AnalysisError("AI_NOT_CONFIGURED");
    }
    throw new AnalysisError("AI_UNAVAILABLE");
  }

  try {
    const response = await context.client.responses.parse({
      model: context.model,
      instructions: analysisInstructions,
      input: [{ role: "user", content: input }],
      text: { format: zodTextFormat(aiAnalysisSchema, "city_scenario_analysis") },
      max_output_tokens: 4_000,
      store: false,
    });

    const refused = response.output.some(item => item.type === "message"
      && item.content.some(content => content.type === "refusal"));
    if (response.status !== "completed" || response.error || refused) {
      throw new AnalysisError("AI_UNAVAILABLE");
    }

    const parsed = aiAnalysisSchema.safeParse(response.output_parsed);
    if (!parsed.success) throw new AnalysisError("AI_UNAVAILABLE");
    return parsed.data;
  } catch {
    // No raw provider payload, prompt, key or stack is exposed to the HTTP adapter.
    throw new AnalysisError("AI_UNAVAILABLE");
  }
}

export const analysisService: AnalysisService = { analyze: analyzeScenario };
