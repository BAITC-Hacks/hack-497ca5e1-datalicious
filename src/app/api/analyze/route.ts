import { NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/domain/types";

export const runtime = "nodejs";

/**
 * The real SimulationEngine is not present in this branch. Do not wire a test double here.
 * Once available, compose createAnalyzeHandler({ engine, analysis: createAgentAnalysisService(engine) })
 * from src/server/analyze-handler.ts and src/server/agent.ts.
 * See docs/AI_INTEGRATION.md for the integration boundary and error contract.
 */
export async function POST() {
  const body: AnalyzeResponse = {
    ok: false,
    error: { code: "NOT_IMPLEMENTED", message: "AI-анализ будет подключён на следующем этапе разработки." },
  };
  return NextResponse.json(body, { status: 501 });
}
