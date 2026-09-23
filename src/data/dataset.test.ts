import { describe, expect, it } from "vitest";
import { dataset, exampleDecisions } from "./dataset";

describe("organizer dataset integrity", () => {
  it("contains complete districts, normalized weights and in-range indicators", () => {
    expect(dataset.districts).toHaveLength(5);
    expect(new Set(dataset.districts.map(d => d.id)).size).toBe(5);
    expect(dataset.indicators).toHaveLength(10);
    expect(dataset.districts.reduce((sum, d) => sum + d.populationShare, 0)).toBeCloseTo(1);
    expect(dataset.indicators.reduce((sum, i) => sum + i.weight, 0)).toBeCloseTo(1);
    const keys = dataset.indicators.map(i => i.id).sort();
    for (const district of dataset.districts) {
      expect(Object.keys(district.indicators).sort()).toEqual(keys);
      for (const value of Object.values(district.indicators)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("keeps measure and rule references internally consistent", () => {
    const ids = new Set<string>(dataset.measures.map(m => m.id));
    expect(ids.size).toBe(14);
    for (const rule of [...dataset.synergies, ...dataset.incompatibilities]) {
      for (const id of rule.pair) expect(ids.has(id)).toBe(true);
    }
    for (const measure of dataset.measures) {
      expect(measure.cost).toBeGreaterThan(0);
      expect(measure.lagQuarters).toBeLessThanOrEqual(dataset.rules.horizonQuarters);
      for (const key of Object.keys(measure.effects)) {
        expect(dataset.indicators.some(i => i.id === key)).toBe(true);
      }
    }
    expect(exampleDecisions.reduce((sum, d) => sum + dataset.measures.find(m => m.id === d.measureId)!.cost, 0)).toBe(95);
  });
});
