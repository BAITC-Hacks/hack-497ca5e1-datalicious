import "server-only";
import { z } from "zod";
import type { AiAnalysis } from "@/domain/types";

const text = z.string().trim().min(1).max(3_000);

/** Validates structure, not the factual accuracy of model-generated prose. */
export const aiAnalysisSchema = z.strictObject({
  summary: text,
  strengths: z.array(text),
  risks: z.array(text),
  consequences: z.array(text),
  recommendations: z.array(text),
}) satisfies z.ZodType<AiAnalysis>;
