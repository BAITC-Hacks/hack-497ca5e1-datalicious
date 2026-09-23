// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createFallbackAnalysis } from "./fallback";
import { aiAnalysisSchema } from "./analysis-schema";
import { createResultFixture, deepFreeze } from "./__tests__/fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("offline explanation of supplied domain facts", () => {
  it("is deterministic, uses organizer labels, and does not mutate frozen facts or use the network", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = deepFreeze(createResultFixture());
    const before = JSON.stringify(result);
    const analysis = createFallbackAnalysis(result);
    expect(createFallbackAnalysis(result)).toEqual(analysis);
    expect(aiAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(analysis.summary).toContain("Резервное объяснение без LLM");
    expect(analysis.summary).toContain("52,56 → 56,54");
    expect(analysis.summary).toContain("95, остаток 5");
    expect(analysis.strengths.join(" ")).toContain("Нура");
    expect(analysis.strengths.join(" ")).toContain("не выявил критических");
    expect(analysis.consequences.join(" ")).toContain("M10 + M12");
    expect(analysis.consequences.join(" ")).toContain("не даёт бонуса");
    expect(JSON.stringify(result)).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains remaining critical values, negative indicator deltas and a declining score", () => {
    const base = createResultFixture();
    const result = {
      ...base,
      scoreDelta: -0.1,
      after: { ...base.after, criticalIndicators: [{ districtId: "nura" as const, indicatorId: "S2" as const, value: 35 }] },
      districtDeltas: base.districtDeltas.map(d => d.districtId === "nura"
        ? { ...d, score: -0.25, indicators: { ...d.indicators, T1: -1.75 } } : d),
    };
    const analysis = createFallbackAnalysis(result);
    expect(analysis.risks.join(" ")).toContain("Разгрузка дорог — изменение -1,75");
    expect(analysis.risks.join(" ")).toContain("Поликлиники и первичная медпомощь — 35");
    expect(analysis.risks.join(" ")).toContain("Score снизился");
    expect(analysis.recommendations.join(" ")).toContain("замены мер");
  });

  it("uses supplied aggregates and critical lists rather than rebuilding the score model", () => {
    const base = createResultFixture();
    // Deliberately inconsistent fixture verifies this layer only presents trusted facts.
    const analysis = createFallbackAnalysis({
      ...base,
      after: { ...base.after, score: 12.34 },
      scoreDelta: 0,
      contributions: [],
      budget: { spent: 100, remaining: 0 },
    });
    expect(analysis.summary).toContain("12,34");
    expect(analysis.summary).toContain("изменение 0");
    expect(analysis.consequences.join(" ")).not.toContain("сработала синергия");
    expect(analysis.consequences.join(" ")).not.toContain("Осталось");
  });
});
