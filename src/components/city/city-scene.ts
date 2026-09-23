import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { dataset } from "@/data/dataset";
import type { Decision, DistrictId } from "@/domain/types";
import { cityLayout } from "./city-layout";
import { createCityRobot } from "./city-robot";

export interface CityScene {
  select: (id: DistrictId | null) => void;
  hover: (id: DistrictId | null) => void;
  projects: (decisions: readonly Decision[]) => void;
  progress: (value: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  dispose: () => void;
}

function inside(x: number, z: number, points: [number, number][]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}

export function createCityScene(
  host: HTMLElement,
  labels: Map<DistrictId, HTMLButtonElement>,
  onSelect: (id: DistrictId) => void,
  onFailure: () => void,
): CityScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101313);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x101313);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.7;
  environment.dispose();
  pmrem.dispose();
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 120);
  camera.position.set(12, 16, 18);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.8, 0.3);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = 0.72;
  controls.minAzimuthAngle = Math.atan2(12, 18) - 0.4;
  controls.maxAzimuthAngle = Math.atan2(12, 18) + 0.4;
  controls.maxPolarAngle = 1.05;
  controls.minZoom = 0.7;
  controls.maxZoom = 2.4;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.6;
  controls.update();
  controls.saveState();
  scene.add(new THREE.HemisphereLight(0xd9f8ed, 0x14251f, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 3.4);
  sun.position.set(-7, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    far: 45,
  });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x00ffa8, 2.5);
  rim.position.set(6, 8, -10);
  scene.add(rim);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(boxGeometry);
  const sphereGeometry = new THREE.IcosahedronGeometry(1, 0);
  geometries.add(sphereGeometry);
  const materialCache = new Map<number, THREE.MeshStandardMaterial>();
  function material(color: number) {
    if (!materialCache.has(color)) {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.45,
        ...(color === 0x00e9a0
          ? { emissive: color, emissiveIntensity: 0.7 }
          : {}),
      });
      materialCache.set(color, m);
      materials.add(m);
    }
    return materialCache.get(color)!;
  }
  function box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
  ) {
    const mesh = new THREE.Mesh(boxGeometry, material(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tree(
    parent: THREE.Object3D,
    x: number,
    z: number,
    size = 0.45,
    base = 0.38,
  ) {
    box(parent, x, base, z, 0.055, size * 0.6, 0.055, 0x425650);
    const top = new THREE.Mesh(sphereGeometry, material(0x178565));
    top.position.set(x, base + size * 0.8, z);
    top.scale.set(size * 0.43, size * 0.7, size * 0.43);
    top.castShadow = true;
    parent.add(top);
  }
  const floor = box(scene, 0, -0.23, 0, 200, 0.12, 200, 0x101313);
  floor.castShadow = false;

  const parcels: {
    id: DistrictId;
    material: THREE.MeshStandardMaterial;
    base: THREE.Color;
    mesh: THREE.Mesh;
    outline?: THREE.LineBasicMaterial;
  }[] = [];
  const pickable: THREE.Mesh[] = [];
  for (const [di, district] of cityLayout.entries()) {
    const shape = new THREE.Shape(
      district.polygon.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.27,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.04,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometries.add(geometry);
    const mat = new THREE.MeshStandardMaterial({
      color: district.color,
      roughness: 0.65,
      metalness: 0.35,
    });
    materials.add(mat);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.district = district.id;
    scene.add(mesh);
    pickable.push(mesh);
    parcels.push({
      id: district.id,
      material: mat,
      base: new THREE.Color(district.color),
      mesh,
    });
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
      district.polygon.map(([x, z]) => new THREE.Vector3(x, 0.34, z)),
    );
    geometries.add(outlineGeometry);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00e9a0,
      transparent: true,
      opacity: 0.7,
    });
    materials.add(lineMat);
    parcels[parcels.length - 1]!.outline = lineMat;
    scene.add(new THREE.LineLoop(outlineGeometry, lineMat));
    let n = 0;
    for (let x = -6.3; x < 7; x += 0.85)
      for (let z = -4.5; z < 5.5; z += 0.85) {
        if (
          !inside(x, z, district.polygon) ||
          !inside(x + 0.3, z + 0.3, district.polygon) ||
          !inside(x - 0.3, z - 0.3, district.polygon)
        )
          continue;
        n++;
        const seed = Math.abs(Math.sin(x * 17.7 + z * 35.4 + di * 9));
        if (n % 5 === 0) {
          tree(scene, x, z, 0.5 + seed * 0.25);
          tree(scene, x + 0.2, z + 0.2, 0.3);
          continue;
        }
        const h =
          district.id === "esil" ? 0.5 + seed * 1.7 : 0.25 + seed * 0.85;
        box(
          scene,
          x,
          0.33,
          z,
          0.51,
          h,
          0.48,
          n % 3 === 0 ? 0x4c625c : 0x263c37,
        );
        box(
          scene,
          x,
          0.33 + h,
          z,
          0.53,
          0.035,
          0.5,
          di === 4 ? 0x51766b : 0x7b9690,
        );
        if (h > 0.6) {
          for (let level = 0.55; level < h + 0.25; level += 0.26) {
            box(
              scene,
              x,
              0.33 + level - 0.2,
              z + 0.244,
              0.32,
              0.075,
              0.012,
              0x00e9a0,
            );
          }
        }
        if (inside(x + 0.4, z, district.polygon))
          box(scene, x + 0.39, 0.315, z, 0.07, 0.015, 0.76, 0x466c60);
      }
  }
  // River and bridges are illustrative city landmarks, not geographic data.
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8, 0.05, -0.1),
    new THREE.Vector3(-4.8, 0.05, 0.1),
    new THREE.Vector3(-2.4, 0.05, 0.45),
    new THREE.Vector3(0.2, 0.05, 2),
    new THREE.Vector3(2.2, 0.05, 2.45),
    new THREE.Vector3(5.5, 0.05, 4.8),
    new THREE.Vector3(7, 0.05, 5.4),
  ]);
  const riverGeometry = new THREE.TubeGeometry(riverCurve, 72, 0.22, 8, false);
  geometries.add(riverGeometry);
  const river = new THREE.Mesh(riverGeometry, material(0x00e9a0));
  river.scale.y = 0.14;
  scene.add(river);
  for (const [x, z] of [
    [-3.4, 0.35],
    [0.9, 2.18],
  ]) {
    const bridge = box(scene, x!, 0.31, z!, 0.32, 0.09, 1.15, 0x889994);
    bridge.rotation.y = -0.5;
  }
  // A small landmark evokes the city without using an official emblem.
  box(scene, -3, 0.35, 2.25, 0.11, 1.65, 0.11, 0xabb9b4);
  const landmark = new THREE.Mesh(sphereGeometry, material(0x00e9a0));
  landmark.scale.setScalar(0.26);
  landmark.position.set(-3, 2.05, 2.25);
  scene.add(landmark);

  const projectLayer = new THREE.Group();
  scene.add(projectLayer);
  const projects: {
    root: THREE.Group;
    build: THREE.Group;
    crane: THREE.Group;
    footprint: THREE.Mesh;
    index: number;
  }[] = [];
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  let reducedMotion = motionPreference.matches;
  const onMotionPreference = () => {
    reducedMotion = motionPreference.matches;
  };
  motionPreference.addEventListener("change", onMotionPreference);
  const highlightColor = new THREE.Color(0x00a873);
  let progress = 0,
    selected: DistrictId | null = null,
    hover: DistrictId | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const robot = createCityRobot();
  scene.add(robot.root);
  const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);
  const surfacePoint = new THREE.Vector3();
  let lastFrame = performance.now();
  let pointedDistrict: DistrictId | null = null;
  function pointAt(id: DistrictId | null, point?: THREE.Vector3) {
    pointedDistrict = id;
    host.dataset.robotTarget = id ?? "";
    host.dataset.robotState = id || point ? "pointing" : "idle";
    if (point) robot.aim(point);
    else if (id) {
      const district = cityLayout.find((d) => d.id === id)!;
      robot.aim(
        new THREE.Vector3(district.center[0], 0.35, district.center[1]),
      );
    } else robot.aim(null);
  }
  pointAt(null);
  let pointerDown: { x: number; y: number } | null = null;
  function hit(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickable)[0];
  }
  function onDown(e: PointerEvent) {
    pointerDown = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    if (
      pointerDown &&
      Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) < 6
    ) {
      const intersection = hit(e);
      if (intersection) {
        const id = intersection.object.userData.district as DistrictId;
        pointAt(id, intersection.point);
        onSelect(id);
      }
    }
    pointerDown = null;
  }
  function onMove(e: PointerEvent) {
    const intersection = hit(e);
    hover =
      (intersection?.object.userData.district as DistrictId | undefined) ??
      null;
    if (!pointerDown && e.pointerType !== "touch") {
      const planeHit = raycaster.ray.intersectPlane(surface, surfacePoint);
      const point =
        intersection?.point ??
        (planeHit && Math.abs(planeHit.x) < 8 && Math.abs(planeHit.z) < 6.5
          ? planeHit
          : undefined);
      pointAt(hover, point);
    }
    renderer.domElement.style.cursor = hover ? "pointer" : "grab";
  }
  function onLeave(event: PointerEvent) {
    hover = null;
    pointerDown = null;
    if (event.pointerType !== "touch") pointAt(null);
  }
  function onLost(e: Event) {
    e.preventDefault();
    onFailure();
  }
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  let width = 1,
    height = 1,
    frame = 0,
    disposed = false;
  const vector = new THREE.Vector3();
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    const halfHeight = Math.max(8.5, 8.1 / (width / height));
    camera.left = (-halfHeight * width) / height;
    camera.right = (halfHeight * width) / height;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  function animate() {
    if (disposed) return;
    const now = performance.now();
    const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    controls.update();
    robot.update(elapsed, now / 1000, reducedMotion);
    for (const parcel of parcels) {
      const active = parcel.id === selected || parcel.id === hover;
      parcel.material.color
        .copy(parcel.base)
        .lerp(
          highlightColor,
          parcel.id === selected ? 0.2 : parcel.id === hover ? 0.1 : 0,
        );
      if (parcel.outline)
        parcel.outline.opacity = THREE.MathUtils.lerp(
          parcel.outline.opacity,
          active ? 1 : 0.32,
          reducedMotion ? 1 : 1 - Math.exp(-10 * elapsed),
        );
    }
    for (const district of cityLayout) {
      const label = labels.get(district.id);
      if (label) {
        vector.set(district.center[0], 1.7, district.center[1]).project(camera);
        label.style.transform = `translate(-50%,-50%) translate(${((vector.x + 1) * width) / 2}px,${((1 - vector.y) * height) / 2}px)`;
      }
    }
    for (const project of projects) {
      const p = THREE.MathUtils.clamp(progress * 5 - project.index, 0, 1);
      project.build.visible = p > 0;
      project.build.scale.y = reducedMotion ? 1 : Math.max(0.01, p);
      project.crane.visible = p > 0 && p < 1;
      project.footprint.visible = p < 1;
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  animate();
  return {
    select(id) {
      if (id !== selected && (id === null || id !== pointedDistrict)) {
        pointAt(id);
      }
      selected = id;
    },
    hover(id) {
      hover = id;
      pointAt(id);
    },
    progress(value) {
      progress = value;
    },
    zoom(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.7, 2.4);
      camera.updateProjectionMatrix();
    },
    reset() {
      controls.reset();
    },
    projects(decisions) {
      projectLayer.clear();
      projects.length = 0;
      decisions.forEach((decision, index) => {
        const measure = dataset.measures.find(
          (m) => m.id === decision.measureId,
        )!;
        const targets = decision.districtId
          ? cityLayout.filter((d) => d.id === decision.districtId)
          : cityLayout;
        for (const district of targets) {
          const root = new THREE.Group();
          root.position.set(
            district.center[0] + (index % 2) * 0.6 - 0.3,
            0.37,
            district.center[1] + 0.65,
          );
          projectLayer.add(root);
          const footprint = box(root, 0, 0, 0, 0.9, 0.015, 0.85, 0xe3b65d);
          const build = new THREE.Group();
          root.add(build);
          const crane = new THREE.Group();
          root.add(crane);
          box(crane, -0.4, 0, -0.3, 0.045, 1.2, 0.045, 0xdba84c);
          box(crane, 0, 1.2, -0.3, 1.1, 0.045, 0.045, 0xdba84c);
          box(crane, 0.4, 0.5, -0.3, 0.015, 0.7, 0.015, 0x536157);
          if (measure.direction === "ecology") {
            box(build, 0, 0, 0, 0.9, 0.04, 0.85, 0x90b783);
            for (const [x, z] of [
              [-0.25, -0.22],
              [0.25, -0.22],
              [-0.25, 0.22],
              [0.25, 0.22],
            ])
              tree(build, x!, z!, 0.5, 0);
          } else if (measure.direction === "transport") {
            box(build, 0, 0, 0, 1.1, 0.025, 0.5, 0x737d79);
            box(build, 0, 0.03, 0, 1.05, 0.015, 0.035, 0xe5c878);
            box(build, 0.1, 0.06, -0.13, 0.55, 0.25, 0.2, 0x278c89);
          } else if (measure.direction === "safety") {
            for (const x of [-0.3, 0.3]) {
              box(build, x, 0, 0, 0.05, 0.9, 0.05, 0x52685e);
              box(build, x, 0.86, 0.1, 0.16, 0.05, 0.28, 0xe8c75d);
            }
          } else {
            box(build, 0, 0, 0, 0.8, 0.45, 0.65, 0xfbf3db);
            box(
              build,
              0,
              0.45,
              0,
              0.87,
              0.07,
              0.72,
              measure.direction === "social" ? 0xd48264 : 0x6e9d9c,
            );
            box(build, 0, 0.13, 0.33, 0.17, 0.22, 0.02, 0x517977);
            if (decision.measureId === "M8") {
              box(build, 0, 0.53, 0, 0.3, 0.02, 0.08, 0xffffff);
              box(build, 0, 0.53, 0, 0.08, 0.02, 0.3, 0xffffff);
            }
          }
          projects.push({ root, build, crane, footprint, index });
        }
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionPreference.removeEventListener("change", onMotionPreference);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      robot.dispose();
      sun.shadow.dispose();
      environmentMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
