import { MathUtils, Vector3 } from "three";

/** Two rigid bones, with elbow flexion limited to 20–135 degrees.
 * The pole selects a stable outward bend; unreachable targets keep their direction.
 */
export function solveArmIK(
  shoulder: Vector3,
  target: Vector3,
  pole: Vector3,
  upper: number,
  lower: number,
) {
  const direction = target.clone().sub(shoulder);
  const requested = direction.length();
  if (requested < 1e-6) direction.set(0, 0, 1);
  else direction.divideScalar(requested);
  const reach = (flexion: number) =>
    Math.sqrt(
      upper * upper +
        lower * lower +
        2 * upper * lower * Math.cos(MathUtils.degToRad(flexion)),
    );
  const distance = MathUtils.clamp(requested, reach(135), reach(20));
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-6) {
    bend.set(
      Math.abs(direction.x) < 0.9 ? 1 : 0,
      Math.abs(direction.x) < 0.9 ? 0 : 1,
      0,
    );
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
  return {
    elbow: shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, offset),
    wrist: shoulder.clone().addScaledVector(direction, distance),
  };
}
