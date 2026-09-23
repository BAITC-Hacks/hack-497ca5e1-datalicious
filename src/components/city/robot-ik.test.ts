import { expect, it } from "vitest";
import { Vector3 } from "three";
import { solveArmIK } from "./robot-ik";

it("keeps rigid bone lengths and bounded elbow flexion for near, far and coincident targets", () => {
  const shoulder = new Vector3(1.72, 4.46, 0);
  const pole = new Vector3(6, 3.4, 0.7);
  for (const target of [
    new Vector3(3, 4.45, 2.7),
    new Vector3(0, 0, 100),
    shoulder.clone(),
    new Vector3(-100, -100, -100),
  ]) {
    const pose = solveArmIK(shoulder, target, pole, 1.85, 1.8);
    expect(shoulder.distanceTo(pose.elbow)).toBeCloseTo(1.85, 8);
    expect(pose.elbow.distanceTo(pose.wrist)).toBeCloseTo(1.8, 8);
    const upper = pose.elbow.clone().sub(shoulder);
    const lower = pose.wrist.clone().sub(pose.elbow);
    const flexion = (upper.angleTo(lower) * 180) / Math.PI;
    expect(flexion).toBeGreaterThanOrEqual(19.999);
    expect(flexion).toBeLessThanOrEqual(135.001);
    expect(pose.wrist.toArray().every(Number.isFinite)).toBe(true);
  }
});

it("keeps a stable outward bend, including a collinear pole", () => {
  const shoulder = new Vector3();
  const target = new Vector3(0, 0, 3);
  const a = solveArmIK(shoulder, target, new Vector3(5, 0, 0), 2, 2);
  const b = solveArmIK(
    shoulder,
    target.clone().add(new Vector3(0.0001, 0, 0)),
    new Vector3(5, 0, 0),
    2,
    2,
  );
  expect(a.elbow.x).toBeGreaterThan(0);
  expect(a.elbow.distanceTo(b.elbow)).toBeLessThan(0.001);
  const parallel = solveArmIK(shoulder, target, new Vector3(0, 0, 10), 2, 2);
  expect(parallel.elbow.toArray().every(Number.isFinite)).toBe(true);
  expect(shoulder.distanceTo(parallel.elbow)).toBeCloseTo(2, 8);
});
