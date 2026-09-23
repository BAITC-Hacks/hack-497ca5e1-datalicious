import "server-only";
import type { ApiErrorCode } from "@/domain/types";

type AnalysisErrorCode = Extract<ApiErrorCode, "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE">;

/** Only safe, public information; provider errors are never attached as a cause. */
export class AnalysisError extends Error {
  constructor(readonly code: AnalysisErrorCode) {
    super(code === "AI_NOT_CONFIGURED"
      ? "AI-анализ не настроен на сервере. Расчёт сценария доступен независимо от AI."
      : "AI-анализ временно недоступен. Сохраните расчёт и попробуйте повторить запрос позже.");
    this.name = "AnalysisError";
  }
}
