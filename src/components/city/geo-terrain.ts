import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  geography,
  type Rings,
  type Point2,
  type MapDistrictId,
} from "./geography";

export function shapeFor(rings: Rings) {
  const shape = new THREE.Shape(
    rings[0]!.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  for (const ring of rings.slice(1))
    shape.holes.push(
      new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
  return shape;
}
export function ribbon(points: readonly Point2[], width: number, y: number) {
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) continue;
    const dx = ((b[1] - a[1]) * width) / length / 2,
      dz = (-(b[0] - a[0]) * width) / length / 2;
    vertices.push(
      a[0] - dx,
      y,
      a[1] - dz,
      b[0] - dx,
      y,
      b[1] - dz,
      b[0] + dx,
      y,
      b[1] + dz,
      a[0] - dx,
      y,
      a[1] - dz,
      b[0] + dx,
      y,
      b[1] + dz,
      a[0] + dx,
      y,
      a[1] + dz,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.computeVertexNormals();
  return g;
}
// Buildings are an illustrative city model, deliberately independent of OSM footprints.
function insideRing([x, z]: Point2, ring: Point2[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function inside(point: Point2, polygons: Rings[]) {
  return polygons.some(
    (r) =>
      insideRing(point, r[0]!) && !r.slice(1).some((h) => insideRing(point, h)),
  );
}
function segmentDistance(p: Point2, a: Point2, b: Point2) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

export function createGeoTerrain() {
  const root = new THREE.Group();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const pickable: THREE.Mesh[] = [];
  const parcels: {
    id: MapDistrictId;
    material: THREE.MeshStandardMaterial;
    outline: THREE.LineBasicMaterial;
    base: THREE.Color;
  }[] = [];
  const material = (color: number) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.06,
    });
    resources.add(m);
    return m;
  };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    resources.add(g);
    const o = new THREE.Mesh(g, m);
    root.add(o);
    return o;
  };
  const walls: THREE.BufferGeometry[] = [],
    roofs: THREE.BufferGeometry[] = [],
    windows: THREE.BufferGeometry[] = [];
  const box = (
    list: THREE.BufferGeometry[],
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  // Keep decorative houses out of the demo routes and pedestrian activity sites.
  const paths = [
    ...Object.values(geography.routes).map((r) => r.points),
    ...Object.values(geography.sites).map((s) => s.path),
  ];
  const nearActivity = (p: Point2) =>
    paths.some((path) =>
      path.some((b, i) => i > 0 && segmentDistance(p, path[i - 1]!, b) < 1),
    );
  let houseCount = 0;
  for (const d of geography.districts) {
    const m = material(0x385546),
      base = m.color.clone();
    const line = new THREE.LineBasicMaterial({
      color: 0xb1d1bc,
      transparent: true,
      opacity: 0.3,
    });
    resources.add(line);
    parcels.push({ id: d.id, material: m, outline: line, base });
    for (const rings of d.polygons) {
      const g = new THREE.ExtrudeGeometry(shapeFor(rings), {
        depth: 0.14,
        bevelEnabled: false,
        steps: 1,
      });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -0.14, 0);
      const parcel = mesh(g, m);
      parcel.userData.district = d.id;
      pickable.push(parcel);
      for (const ring of rings) {
        const outline = new THREE.BufferGeometry().setFromPoints(
          ring.map(([x, z]) => new THREE.Vector3(x, 0.014, z)),
        );
        resources.add(outline);
        root.add(new THREE.Line(outline, line));
      }
    }
    const pts = d.polygons.flatMap((r) => r[0]!);
    const minX = Math.min(...pts.map((p) => p[0])),
      maxX = Math.max(...pts.map((p) => p[0]));
    const minZ = Math.min(...pts.map((p) => p[1])),
      maxZ = Math.max(...pts.map((p) => p[1]));
    const candidates: Point2[] = [];
    for (let z = minZ + 0.8; z < maxZ; z += 1.55) {
      for (let x = minX + 0.8; x < maxX; x += 1.55) {
        if (
          ![-0.6, 0.6].every((dx) =>
            [-0.6, 0.6].every((dz) => inside([x + dx, z + dz], d.polygons)),
          )
        )
          continue;
        if (
          Math.hypot(x - d.fullCenter[0], z - d.fullCenter[1]) < 1.9 ||
          nearActivity([x, z])
        )
          continue;
        candidates.push([x, z]);
      }
    }
    const count = Math.min(
      candidates.length,
      Math.round(Math.sqrt(d.areaKm2) * 3),
    );
    for (let i = 0; i < count; i++) {
      const [x, z] = candidates[Math.floor((i * candidates.length) / count)]!;
      const seed =
        Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      const floors = 2 + Math.floor(seed * 5),
        h = floors * 0.33;
      const w = 0.64 + seed * 0.24,
        depth = 0.67;
      box(walls, x, h / 2 + 0.03, z, w, h, depth);
      box(roofs, x, 0.035, z, w + 0.12, 0.07, depth + 0.12);
      if (floors < 4) {
        const shape = new THREE.Shape([
          new THREE.Vector2(-w / 2 - 0.05, 0),
          new THREE.Vector2(w / 2 + 0.05, 0),
          new THREE.Vector2(0, 0.28),
        ]);
        const roof = new THREE.ExtrudeGeometry(shape, {
          depth: depth + 0.1,
          bevelEnabled: false,
        });
        roof.translate(x, h + 0.03, z - (depth + 0.1) / 2);
        roofs.push(roof);
      } else {
        box(roofs, x, h + 0.07, z, w + 0.07, 0.1, depth + 0.07);
        box(roofs, x + 0.12, h + 0.18, z - 0.1, w * 0.35, 0.14, depth * 0.45);
      }
      for (let floor = 0; floor < floors; floor++) {
        const y = 0.22 + floor * 0.33;
        for (const col of [-1, 1]) {
          box(
            windows,
            x + col * w * 0.24,
            y,
            z + depth / 2 + 0.009,
            0.14,
            0.13,
            0.016,
          );
          box(
            windows,
            x + col * w * 0.24,
            y,
            z - depth / 2 - 0.009,
            0.14,
            0.13,
            0.016,
          );
          box(windows, x + w / 2 + 0.009, y, z + col * 0.16, 0.016, 0.13, 0.13);
        }
      }
      box(roofs, x, 0.16, z + depth / 2 + 0.015, 0.13, 0.25, 0.025);
      houseCount++;
    }
  }
  for (const [geometries, color] of [
    [walls, 0xb8cec0],
    [roofs, 0x3b6757],
    [windows, 0x315b4a],
  ] as const) {
    if (!geometries.length) continue;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged) mesh(merged, material(color));
  }
  root.userData.houseCount = houseCount;
  return {
    root,
    pickable,
    parcels,
    dispose() {
      root.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
