import * as THREE from "three";
import { dataset } from "@/data/dataset";
import type { Decision, DistrictId } from "@/domain/types";
import { geography, pathSample, type Point2 } from "./geography";
import { ribbon } from "./geo-terrain";

/** Deterministic ten-second DEMO timeline; it never represents backend job status. */
export function createPlanActivities(decisions: readonly Decision[]) {
  const root = new THREE.Group();
  root.name = "plan-activities";
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const box = new THREE.BoxGeometry(1, 1, 1),
    sphere = new THREE.SphereGeometry(1, 8, 6),
    cone = new THREE.ConeGeometry(1, 1, 8);
  resources.add(box);
  resources.add(sphere);
  resources.add(cone);
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  function material(color: number) {
    if (!mats.has(color)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
      mats.set(color, m);
      resources.add(m);
    }
    return mats.get(color)!;
  }
  function part(
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    color: number,
    p: [number, number, number],
    s: [number, number, number],
  ) {
    const m = new THREE.Mesh(g, material(color));
    m.position.set(...p);
    m.scale.set(...s);
    parent.add(m);
    return m;
  }
  function block(
    parent: THREE.Object3D,
    color: number,
    p: [number, number, number],
    s: [number, number, number],
  ) {
    return part(parent, box, color, p, s);
  }
  function person(parent: THREE.Object3D) {
    const p = new THREE.Group();
    parent.add(p);
    block(p, 0x9cd5bc, [0, 0.022, 0], [0.011, 0.032, 0.012]);
    part(p, sphere, 0xd7d3bc, [0, 0.047, 0], [0.009, 0.009, 0.009]);
    return p;
  }
  const actors: {
    index: number;
    district: DistrictId;
    group: THREE.Group;
    update: (t: number, p: number, reduced: boolean) => void;
  }[] = [];
  const counts = { buses: 0, people: 0, particles: 0 };
  const yaw = new THREE.Quaternion();
  function follow(
    object: THREE.Object3D,
    path: Point2[],
    at: number,
    y: number,
    reduced: boolean,
  ) {
    const point = pathSample(path, at);
    object.position.set(point.x, y, point.z);
    yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), point.angle);
    object.quaternion.slerp(yaw, reduced ? 1 : 0.2);
  }
  for (const [index, decision] of decisions.entries()) {
    const measure = dataset.measures.find((m) => m.id === decision.measureId)!;
    const targets = decision.districtId
      ? [decision.districtId]
      : dataset.districts.map((d) => d.id);
    for (const district of targets) {
      const group = new THREE.Group();
      group.name = `${decision.measureId}:${district}`;
      root.add(group);
      const route = geography.routes[district],
        site = geography.sites[district];
      const walkers: THREE.Group[] = [];
      const buses: THREE.Group[] = [];
      const effects: ((t: number, p: number, reduced: boolean) => void)[] = [];
      const [sx, sz] = site.point;
      if (measure.direction === "transport") {
        const roadGeometry = ribbon(route.points, 0.033, 0.072);
        resources.add(roadGeometry);
        group.add(new THREE.Mesh(roadGeometry, material(0x52997b)));
        // Two vehicles for a district measure, one per district for a city measure.
        for (let i = 0; i < (decision.districtId ? 2 : 1); i++) {
          const bus = new THREE.Group();
          group.add(bus);
          buses.push(bus);
          counts.buses++;
          block(bus, 0xa3ead0, [0, 0.018, 0], [0.023, 0.028, 0.065]);
          block(bus, 0x17362e, [0, 0.025, 0], [0.024, 0.011, 0.05]);
          block(bus, 0xd7e8dc, [0, 0.036, 0], [0.023, 0.003, 0.064]);
          for (const x of [-0.013, 0.013])
            for (const z of [-0.022, 0.022])
              part(bus, sphere, 0x101b16, [x, 0.006, z], [0.005, 0.006, 0.006]);
        }
        for (const stop of route.stops) {
          const at = pathSample(route.points, stop.at);
          block(
            group,
            0xa8d7bf,
            [at.x + 0.024, 0.016, at.z],
            [0.008, 0.032, 0.008],
          );
          block(
            group,
            0xd6e6d9,
            [at.x + 0.024, 0.032, at.z],
            [0.025, 0.005, 0.014],
          );
        }
        effects.push((time, _p, reduced) =>
          buses.forEach((bus, i) => {
            // Travel and dwell are part of this visual timeline. Pause at mapped stops.
            let t = Math.max(0, time - i * 0.6),
              previous = 0,
              at = 0;
            for (const stop of [...route.stops, { at: 1 }]) {
              const travel = (stop.at - previous) * 12;
              if (t < travel) {
                at = previous + t / 12;
                break;
              }
              t -= travel;
              at = stop.at;
              if (t < 0.65) break;
              t -= 0.65;
              previous = stop.at;
            }
            follow(
              bus,
              route.points,
              reduced ? 0.4 + i * 0.13 : Math.min(0.995, at),
              0.075,
              reduced,
            );
          }),
        );
        // Work zones are only shown for infrastructure changes M1/M3, not M2.
        if (decision.measureId === "M1" || decision.measureId === "M3") {
          const work = new THREE.Group(),
            p = pathSample(route.points, 0.4);
          work.position.set(p.x, 0.085, p.z);
          work.rotation.y = p.angle;
          group.add(work);
          for (const x of [-0.023, 0.023])
            for (const z of [-0.07, 0, 0.07])
              part(work, cone, 0xc5d8ab, [x, 0.009, z], [0.006, 0.018, 0.006]);
          block(work, 0x719882, [0.044, 0.02, 0], [0.031, 0.027, 0.048]);
          block(work, 0xc2d2bd, [0.047, 0.05, 0.018], [0.01, 0.07, 0.01]);
          for (const z of [-0.045, 0.045]) {
            const worker = person(work);
            worker.position.set(0.035, 0, z);
          }
          if (decision.measureId === "M3")
            for (const x of [-0.006, 0.006])
              block(work, 0xb4c7bb, [x, 0, 0], [0.002, 0.004, 0.19]);
        }
        if (decision.measureId === "M2") {
          const p = pathSample(route.points, 0.5);
          block(group, 0x809b8c, [p.x, 0.04, p.z], [0.007, 0.08, 0.007]);
          part(
            group,
            sphere,
            0x8ce7bd,
            [p.x, 0.079, p.z],
            [0.008, 0.008, 0.008],
          );
        }
      } else if (measure.direction === "social") {
        // An opening-day demo on an existing mapped public path, not a proposed
        // school/clinic building footprint or a real construction permit.
        const platform = new THREE.Group();
        platform.position.set(sx, 0.035, sz);
        group.add(platform);
        block(platform, 0x729c89, [0, 0.008, 0], [0.046, 0.016, 0.038]);
        block(platform, 0xbadbc7, [0, 0.034, -0.016], [0.05, 0.045, 0.004]);
        // M7: learning station. M8: health outreach. M9: sports activity.
        if (decision.measureId === "M8") {
          block(platform, 0xf0f3e9, [0, 0.04, -0.012], [0.028, 0.006, 0.005]);
          block(platform, 0xf0f3e9, [0, 0.04, -0.012], [0.006, 0.028, 0.005]);
        }
        if (decision.measureId === "M9")
          part(
            platform,
            sphere,
            0xe1e6cc,
            [0, 0.025, 0.008],
            [0.009, 0.009, 0.009],
          );
        for (let i = 0; i < 6; i++) {
          walkers.push(person(group));
          counts.people++;
        }
        effects.push((t, _p, reduced) =>
          walkers.forEach((p, i) =>
            follow(
              p,
              site.path,
              reduced
                ? (i + 1) / 8
                : 0.12 + i * 0.13 + Math.sin(t * 0.65 + i) * 0.09,
              0.04,
              reduced,
            ),
          ),
        );
        const fireworks = new THREE.Group();
        fireworks.position.set(sx, 0.12, sz);
        group.add(fireworks);
        const sparks = Array.from({ length: 12 }, () => {
          counts.particles++;
          return part(
            fireworks,
            sphere,
            0xb7ecd4,
            [0, 0, 0],
            [0.006, 0.006, 0.006],
          );
        });
        effects.push((_t, p, reduced) => {
          const age = (p - 0.74) / 0.26;
          fireworks.visible = !reduced && age > 0 && age < 1;
          for (let i = 0; i < sparks.length; i++) {
            const angle = (i / sparks.length) * Math.PI * 2;
            const r = age * 0.19;
            sparks[i]!.position.set(
              Math.cos(angle) * r,
              0.16 + Math.sin(Math.PI * age) * 0.12 - age * age * 0.13,
              Math.sin(angle) * r,
            );
            sparks[i]!.scale.setScalar(0.006 * (1 - age));
          }
        });
      } else if (measure.direction === "ecology") {
        if (decision.measureId === "M5") {
          const p = pathSample(route.points, 0.55);
          block(group, 0x89b59b, [p.x, 0.04, p.z], [0.04, 0.06, 0.065]);
          block(group, 0xc8e6d3, [p.x, 0.08, p.z], [0.025, 0.02, 0.025]);
        } else
          for (let i = 0; i < 8; i++) {
            const p = pathSample(site.path, (i + 0.5) / 8);
            block(group, 0x819c88, [p.x, 0.025, p.z], [0.006, 0.05, 0.006]);
            part(
              group,
              cone,
              0x65a283,
              [p.x, 0.07, p.z],
              [0.027, 0.075, 0.027],
            );
          }
      } else if (measure.direction === "safety") {
        for (let i = 0; i < 5; i++) {
          const p = pathSample(route.points, (i + 0.5) / 5);
          block(group, 0x8faa99, [p.x, 0.045, p.z], [0.006, 0.09, 0.006]);
          block(group, 0xd4e4ce, [p.x, 0.09, p.z], [0.022, 0.009, 0.014]);
          if (decision.measureId === "M11")
            for (let n = 0; n < 4; n++)
              block(
                group,
                0xd4e4ce,
                [p.x + (n - 1.5) * 0.009, 0.077, p.z],
                [0.004, 0.002, 0.025],
              );
        }
      } else {
        const p = pathSample(route.points, 0.3);
        const service = new THREE.Group();
        service.position.set(p.x, 0.08, p.z);
        group.add(service);
        if (decision.measureId === "M12") {
          part(service, sphere, 0x8adbb3, [0, 0.06, 0], [0.026, 0.026, 0.026]);
          block(service, 0x92b29e, [0, 0.025, 0], [0.009, 0.05, 0.009]);
        } else {
          block(service, 0xabcbb8, [0, 0.018, 0], [0.03, 0.03, 0.06]);
          for (let i = 0; i < 2; i++) {
            const worker = person(service);
            worker.position.set(0.035, 0, (i - 0.5) * 0.04);
          }
          if (decision.measureId === "M13")
            block(service, 0x769580, [0.04, 0.004, 0], [0.014, 0.008, 0.16]);
        }
      }
      actors.push({
        index,
        district,
        group,
        update(t, p, reduced) {
          for (const update of effects) update(t, p, reduced);
        },
      });
    }
  }
  return {
    root,
    counts,
    update(progress: number, reduced: boolean) {
      for (const actor of actors) {
        const local = progress * 5 - actor.index;
        actor.group.visible = local > 0;
        actor.update(
          Math.max(0, progress * 10 - actor.index * 2),
          Math.max(0, Math.min(1, local)),
          reduced,
        );
      }
    },
    dispose() {
      root.removeFromParent();
      for (const r of resources) r.dispose();
    },
  };
}
