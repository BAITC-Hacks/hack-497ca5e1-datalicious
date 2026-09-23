import { simulationEngine } from "@/domain";
import { createAnalyzeHandler } from "@/server/analyze-handler";
import { createAgentAnalysisService } from "@/server/agent";

export const runtime = "nodejs";

// Both the original scenario and agent candidates use participant 1's real engine.
export const POST = createAnalyzeHandler({
  engine: simulationEngine,
  analysis: createAgentAnalysisService(simulationEngine),
});
