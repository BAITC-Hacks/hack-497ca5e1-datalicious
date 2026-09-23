import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Decision } from "@/domain/types";
import { createCityRobot } from "./city-robot";
import { createGeoTerrain } from "./geo-terrain";
import { createPlanActivities } from "./plan-activities";
import { geography, pathSample, type MapDistrictId } from "./geography";

export interface CityScene {
  select: (id: MapDistrictId | null) => void;
  hover: (id: MapDistrictId | null) => void;
  projects: (decisions: readonly Decision[]) => void;
  progress: (value: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  focus: () => void;
  dispose: () => void;
}
export function createCityScene(
  host: HTMLElement,
  labels: Map<MapDistrictId, HTMLButtonElement>,
  onSelect: (id: MapDistrictId) => void,
  onFailure: () => void,
): CityScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101916);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);
  const environment = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer),
    envMap = pmrem.fromScene(environment, 0.04);
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.65;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe1f1e7, 0x18261f, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(-7, 16, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fdec1, 1.6);
  rim.position.set(5, 10, -10);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  camera.position.set(12, 19, 23);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3.5, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = 1.02;
  controls.minAzimuthAngle = 0.22;
  controls.maxAzimuthAngle = 0.8;
  controls.minZoom = 0.7;
  controls.maxZoom = 20;
  controls.rotateSpeed = 0.35;
  controls.update();
  controls.saveState();
  const terrain = createGeoTerrain();
  scene.add(terrain.root);
  host.dataset.houseCount = String(terrain.root.userData.houseCount);
  const robot = createCityRobot();
  scene.add(robot.root);
  let activities = createPlanActivities([]);
  scene.add(activities.root);
  let decisions: readonly Decision[] = [],
    progress = 0,
    selected: MapDistrictId | null = null,
    hover: MapDistrictId | null = null,
    pointed: MapDistrictId | null = null;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = preference.matches;
  const onPreference = () => {
    reduced = preference.matches;
    controls.enableDamping = !reduced;
  };
  onPreference();
  preference.addEventListener("change", onPreference);
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02),
    surfacePoint = new THREE.Vector3();
  function pointAt(id: MapDistrictId | null, point?: THREE.Vector3) {
    pointed = id;
    host.dataset.robotTarget = id ?? "";
    host.dataset.robotState = id || point ? "pointing" : "idle";
    if (point) robot.aim(point);
    else if (id) {
      const d = geography.districts.find((d) => d.id === id)!;
      const c = d.fullCenter;
      robot.aim(new THREE.Vector3(c[0], 0.04, c[1]));
    } else robot.aim(null);
  }
  pointAt(null);
  let down: { x: number; y: number } | null = null;
  function hit(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(
      terrain.pickable.filter((p) => p.parent?.visible),
    )[0];
  }
  function onDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
      const h = hit(e);
      if (h) {
        const id = h.object.userData.district as MapDistrictId;
        pointAt(id, h.point);
        onSelect(id);
      }
    }
    down = null;
  }
  function onMove(e: PointerEvent) {
    const h = hit(e);
    hover = (h?.object.userData.district as MapDistrictId) ?? null;
    if (!down && e.pointerType !== "touch") {
      const p = raycaster.ray.intersectPlane(surface, surfacePoint);
      pointAt(
        hover,
        h?.point ??
          (p && Math.abs(p.x) < 6 && Math.abs(p.z) < 7 ? p : undefined),
      );
    }
    renderer.domElement.style.cursor = hover ? "pointer" : "grab";
  }
  function onLeave(e: PointerEvent) {
    hover = null;
    down = null;
    if (e.pointerType !== "touch") pointAt(null);
  }
  function onLost(e: Event) {
    e.preventDefault();
    onFailure();
  }
  for (const [type, listener] of [
    ["pointerdown", onDown],
    ["pointerup", onUp],
    ["pointermove", onMove],
    ["pointerleave", onLeave],
    ["pointercancel", onLeave],
  ] as const)
    renderer.domElement.addEventListener(type, listener);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  let width = 1,
    height = 1,
    frame = 0,
    disposed = false,
    lastFrame = performance.now();
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    const half = Math.max(25, 25 / (width / height));
    camera.left = (-half * width) / height;
    camera.right = (half * width) / height;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    robot.root.scale.setScalar(width < 500 ? 2.7 : 3.1);
    robot.root.position.set(-8, width < 500 ? -9 : -10, -17);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const vector = new THREE.Vector3();
  let labelFrame = 0;
  function animate() {
    if (disposed) return;
    const now = performance.now(),
      delta = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    controls.update();
    robot.update(delta, now / 1000, reduced);
    activities.update(progress, reduced);
    for (const parcel of terrain.parcels) {
      const active = parcel.id === selected || parcel.id === hover;
      parcel.material.color
        .copy(parcel.base)
        .lerp(new THREE.Color(0x51856a), active ? 0.3 : 0);
      parcel.outline.opacity = THREE.MathUtils.lerp(
        parcel.outline.opacity,
        active ? 0.85 : 0.2,
        reduced ? 1 : 1 - Math.exp(-10 * delta),
      );
    }
    // Screen-space collision rejection affects labels only, never geography.
    if (labelFrame++ % 2 === 0) {
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const sorted = [...geography.districts].sort(
        (a, b) => Number(b.id === selected) - Number(a.id === selected),
      );
      for (const d of sorted) {
        const label = labels.get(d.id);
        if (!label) continue;
        const c = d.fullCenter;
        vector.set(c[0], 0.22, c[1]).project(camera);
        const x = ((vector.x + 1) * width) / 2,
          y = ((1 - vector.y) * height) / 2,
          w = label.offsetWidth || 85,
          h = label.offsetHeight || 32;
        let visible =
          x > w / 2 + 6 && x < width - w / 2 - 6 && y > 35 && y < height - 50;
        for (const r of occupied)
          if (
            Math.abs(x - r.x) < (w + r.w) / 2 + 8 &&
            Math.abs(y - r.y) < (h + r.h) / 2 + 8
          )
            visible = false;
        label.style.visibility = visible ? "visible" : "hidden";
        label.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
        if (visible) occupied.push({ x, y, w, h });
      }
    }
    host.dataset.activeStage =
      progress > 0 ? String(Math.min(5, Math.floor(progress * 5) + 1)) : "0";
    host.dataset.activityCount = String(
      activities.root.children.filter((c) => c.visible).length,
    );
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  animate();
  function rebuild() {
    activities.dispose();
    activities = createPlanActivities(decisions);
    scene.add(activities.root);
    host.dataset.busCount = String(activities.counts.buses);
    host.dataset.particleCount = String(
      reduced ? 0 : activities.counts.particles,
    );
  }
  return {
    select(id) {
      if (id !== selected && (id === null || id !== pointed)) pointAt(id);
      selected = id;
    },
    hover(id) {
      hover = id;
      pointAt(id);
    },
    projects(next) {
      decisions = next;
      rebuild();
    },
    progress(value) {
      if (value < progress) rebuild();
      progress = value;
    },
    zoom(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.7, 20);
      camera.updateProjectionMatrix();
    },
    focus() {
      const d = decisions[Math.min(4, Math.max(0, Math.floor(progress * 5)))];
      const id =
        d?.districtId ??
        (selected && selected !== "sarayshyq" ? selected : "esil");
      const route = geography.routes[id],
        site = geography.sites[id];
      const p =
        d?.measureId.startsWith("M") && ["M1", "M2", "M3"].includes(d.measureId)
          ? pathSample(route.points, 0.4)
          : { x: site.point[0], z: site.point[1] };
      const target = new THREE.Vector3(p.x, 0.3, p.z);
      camera.position.add(target.clone().sub(controls.target));
      controls.target.copy(target);
      camera.zoom = 16;
      camera.updateProjectionMatrix();
    },
    reset() {
      controls.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener("change", onPreference);
      controls.dispose();
      for (const [type, listener] of [
        ["pointerdown", onDown],
        ["pointerup", onUp],
        ["pointermove", onMove],
        ["pointerleave", onLeave],
        ["pointercancel", onLeave],
      ] as const)
        renderer.domElement.removeEventListener(type, listener);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      terrain.dispose();
      activities.dispose();
      robot.dispose();
      envMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
