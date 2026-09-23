import "server-only";
import OpenAI from "openai";
import { z } from "zod";

const configSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z.string().trim().min(1),
});

/** Lazy server-only infrastructure. Never invoked by the scaffold route or build. */
export function createOpenAIContext(): { client: OpenAI; model: string } {
  const config = configSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });
  if (!config.success) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return {
    client: new OpenAI({ apiKey: config.data.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 }),
    model: config.data.OPENAI_MODEL,
  };
}
