import { NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/domain/types";

export const runtime = "nodejs";

/** Placeholder until domain validation and AnalysisService are implemented. */
export async function POST() {
  const body: AnalyzeResponse = {
    ok: false,
    error: { code: "NOT_IMPLEMENTED", message: "AI-анализ будет подключён на следующем этапе разработки." },
  };
  return NextResponse.json(body, { status: 501 });
}
