import "server-only";
import { z } from "zod";
import type { AnalysisService, AnalyzeResponse, ApiError, SimulationEngine } from "@/domain/types";
import { AnalysisError } from "./analysis-error";
import { aiAnalysisSchema } from "./analysis-schema";
import { createFallbackAnalysis } from "./fallback";

// Only the HTTP envelope belongs here. Scenario shape and rules belong to the domain.
const requestEnvelope = z.strictObject({
  scenario: z.unknown().refine(value => value !== undefined, "scenario is required"),
  mode: z.enum(["agent", "local"]).default("agent"),
});

function failure(status: number, error: ApiError): Response {
  return Response.json({ ok: false, error } satisfies AnalyzeResponse, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Both modes recalculate server facts; local analysis never touches the AI adapter. */
export function createAnalyzeHandler(dependencies: {
  engine: SimulationEngine;
  analysis: AnalysisService;
}): (request: Request) => Promise<Response> {
  return async function handleAnalyze(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(400, { code: "INVALID_REQUEST", message: "Тело запроса должно содержать корректный JSON." });
    }

    const envelope = requestEnvelope.safeParse(body);
    if (!envelope.success) {
      return failure(400, { code: "INVALID_REQUEST", message: "Ожидаются scenario и необязательный mode: agent или local." });
    }

    try {
      const evaluation = dependencies.engine.evaluate(envelope.data.scenario);
      if (!evaluation.ok) {
        const invalidShape = evaluation.issues.some(issue => issue.code === "INVALID_SHAPE");
        return failure(invalidShape ? 400 : 422, {
          code: invalidShape ? "INVALID_REQUEST" : "INVALID_SCENARIO",
          message: invalidShape ? "Неверная структура сценария." : "Сценарий нарушает правила симулятора.",
          issues: evaluation.issues,
        });
      }

      // Isolate trusted facts from accidental mutation by an analysis adapter.
      const result = evaluation.result;
      const source = envelope.data.mode;
      let analysis;
      try {
        analysis = aiAnalysisSchema.safeParse(source === "local"
          ? createFallbackAnalysis(structuredClone(result))
          : await dependencies.analysis.analyze(structuredClone(result)));
      } catch (error) {
        if (error instanceof AnalysisError) {
          return failure(error.code === "AI_NOT_CONFIGURED" ? 503 : 502, {
            code: error.code, message: error.message,
          });
        }
        throw error;
      }
      if (!analysis.success) {
        if (source === "local") throw new Error("Invalid local analysis result");
        const error = new AnalysisError("AI_UNAVAILABLE");
        return failure(502, { code: error.code, message: error.message });
      }

      return Response.json({ ok: true, result, analysis: analysis.data, source } satisfies AnalyzeResponse, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return failure(500, { code: "INTERNAL_ERROR", message: "Не удалось обработать сценарий. Попробуйте повторить запрос." });
    }
  };
}
