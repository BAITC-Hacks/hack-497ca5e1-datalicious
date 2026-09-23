import { expect, it } from "vitest";
import { geography, pathSample, type Point2, type Rings } from "./geography";
import { createPlanActivities } from "./plan-activities";
function inside(p: Point2, ring: Point2[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function inPolygon(p: Point2, r: Rings) {
  return inside(p, r[0]!) && !r.slice(1).some((h) => inside(p, h));
}
it("retains six sourced district boundaries and the four mapped landmarks", () => {
  expect(geography.districts.map((d) => d.osmId).sort()).toEqual(
    [3479876, 3482819, 3486954, 8593081, 19733918, 20593940].sort(),
  );
  expect(geography.landmarks.map((l) => l.id)).toEqual([
    "baiterek",
    "akorda",
    "khan",
    "expo",
  ]);
  for (const d of geography.districts) {
    expect(d.version).toBeGreaterThan(0);
    expect(d.polygons.length).toBeGreaterThan(0);
  }
});
it("keeps every demo path and public venue inside its sourced district", () => {
  for (const [id, route] of Object.entries(geography.routes)) {
    const district = geography.districts.find((d) => d.id === id)!;
    for (let i = 0; i <= 100; i++) {
      const p = pathSample(route.points, i / 100);
      expect(
        district.polygons.some((r) => inPolygon([p.x, p.z], r)),
        id,
      ).toBe(true);
    }
    expect(route.stops.length).toBeGreaterThan(0);
    const site = geography.sites[id as keyof typeof geography.sites];
    expect(
      district.polygons.some((r) => inPolygon(site.point, r)),
      id,
    ).toBe(true);
  }
});
it("shows only started actions and does not accumulate actors when a demo is rebuilt", () => {
  const decisions = [
    { measureId: "M1", districtId: "nura" },
    { measureId: "M7", districtId: "nura" },
  ] as const;
  const a = createPlanActivities(decisions);
  a.update(0, false);
  expect(a.root.children.filter((c) => c.visible)).toHaveLength(0);
  a.update(0.1, false);
  expect(a.root.children.filter((c) => c.visible)).toHaveLength(1);
  a.update(0.35, true);
  expect(a.counts.buses).toBe(2);
  expect(a.counts.people).toBe(6);
  expect(a.counts.particles).toBeLessThanOrEqual(24);
  a.dispose();
  const b = createPlanActivities(decisions);
  expect(b.root.children).toHaveLength(2);
  b.dispose();
});
