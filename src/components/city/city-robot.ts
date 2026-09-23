import * as THREE from "three";
import { solveArmIK } from "./robot-ik";

export interface CityRobot {
  root: THREE.Group;
  aim: (point: THREE.Vector3 | null) => void;
  update: (delta: number, time: number, reducedMotion: boolean) => void;
  dispose: () => void;
}

/** Model integration point: replace this factory with a rigged GLTF implementation
 * of CityRobot. aim receives WORLD coordinates, not screen coordinates.
 * This model is built locally from geometry; no original robot meshes are bundled.
 */
export function createCityRobot(): CityRobot {
  const root = new THREE.Group();
  root.name = "astana-robot";
  root.position.set(-3.8, -1.1, -5.7);
  root.rotation.y = Math.atan2(12, 18);
  const resources = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Texture
  >();
  function metal(color: number, roughness: number, metalness = 0.85) {
    const m = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    resources.add(m);
    return m;
  }
  const black = metal(0x080b0c, 0.19, 0.8);
  const casing = metal(0x171c1e, 0.28);
  const chrome = metal(0xa1aeae, 0.17, 1);
  const joint = metal(0x323c3e, 0.28);
  const eyes = new THREE.MeshBasicMaterial({
    color: 0xe4fff3,
    toneMapped: false,
  });
  resources.add(eyes);
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  resources.add(sphere);
  resources.add(cylinder);
  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: number[],
    scale: number[],
  ) {
    resources.add(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(position[0]!, position[1]!, position[2]!);
    m.scale.set(scale[0]!, scale[1]!, scale[2]!);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function ball(
    parent: THREE.Object3D,
    position: number[],
    scale: number[],
    material = casing,
  ) {
    return mesh(parent, sphere, material, position, scale);
  }
  const body = new THREE.Group();
  root.add(body);
  const torsoGeometry = new THREE.SphereGeometry(1, 40, 32);
  const positions = torsoGeometry.attributes.position!;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    positions.setX(i, positions.getX(i) * (0.76 + (0.24 * (y + 1)) / 2));
  }
  torsoGeometry.computeVertexNormals();
  mesh(body, torsoGeometry, black, [0, 2.9, 0], [1.95, 2.15, 0.83]);
  ball(body, [0, 1.05, 0], [0.68, 0.8, 0.57], joint);
  mesh(body, cylinder, chrome, [0, 5.12, 0], [0.29, 0.62, 0.29]);
  mesh(body, cylinder, black, [0, 4.87, 0], [0.55, 0.17, 0.55]);
  for (const x of [-0.42, 0.42]) {
    const strut = mesh(
      body,
      cylinder,
      joint,
      [x, 5.12, 0.02],
      [0.06, 0.6, 0.06],
    );
    strut.rotation.z = -x * 0.5;
  }
  const head = new THREE.Group();
  head.position.set(0, 6.35, 0);
  head.scale.setScalar(1.12);
  body.add(head);
  ball(head, [0, 0, 0], [1.03, 1.29, 0.8], black);
  ball(head, [0, 0.04, 0.29], [0.93, 1.2, 0.64], black);
  // A glossy visor and individually modelled LEDs, not a flat face image.
  for (const side of [-1, 1]) {
    ball(head, [side * 0.92, -0.12, 0.04], [0.085, 0.86, 0.36], chrome);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 6; col++) {
        if ((row === 0 || row === 3) && (col === 0 || col === 5)) continue;
        const x = side * 0.39 + (col - 2.5) * 0.058,
          y = 0.03 + (row - 1.5) * 0.067;
        mesh(
          head,
          sphere,
          eyes,
          [x, y, 0.94 - Math.abs(x) * 0.08],
          [0.02, 0.022, 0.014],
        );
      }
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f7ffff";
    ctx.font = "bold 112px Arial";
    ctx.textBaseline = "top";
    ctx.fillText("ASTANA", 22, 27);
    ctx.fillText("INNOVATIONS", 22, 145);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.add(texture);
    const label = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    resources.add(label);
    mesh(
      body,
      new THREE.PlaneGeometry(2.42, 0.76),
      label,
      [0, 3.72, 0.824],
      [1, 1, 1],
    );
  }
  const upperLength = 1.85,
    lowerLength = 1.8;
  const yAxis = new THREE.Vector3(0, 1, 0),
    zAxis = new THREE.Vector3(0, 0, 1);
  function makeArm(side: number) {
    const shoulder = new THREE.Vector3(side * 1.72, 4.46, 0);
    ball(body, shoulder.toArray(), [0.55, 0.55, 0.55], joint);
    const upper = new THREE.Group();
    upper.position.copy(shoulder);
    body.add(upper);
    ball(
      upper,
      [0, upperLength * 0.47, 0],
      [0.51, upperLength * 0.52, 0.46],
      casing,
    );
    mesh(
      upper,
      cylinder,
      chrome,
      [0, upperLength * 0.89, 0],
      [0.29, 0.2, 0.29],
    );
    const elbow = new THREE.Group();
    elbow.position.y = upperLength;
    upper.add(elbow);
    ball(elbow, [0, 0, 0], [0.36, 0.36, 0.36], chrome);
    const lower = new THREE.Group();
    elbow.add(lower);
    ball(
      lower,
      [0, lowerLength * 0.48, 0],
      [0.4, lowerLength * 0.48, 0.36],
      black,
    );
    for (const x of [-0.27, 0.27])
      mesh(
        lower,
        cylinder,
        chrome,
        [x, lowerLength * 0.49, 0.15],
        [0.035, lowerLength * 0.65, 0.035],
      );
    mesh(lower, cylinder, chrome, [0, lowerLength - 0.1, 0], [0.23, 0.2, 0.23]);
    const hand = new THREE.Group();
    hand.position.y = lowerLength;
    lower.add(hand);
    ball(hand, [0, 0, 0], [0.24, 0.24, 0.24], joint);
    ball(hand, [0, 0, 0.4], [0.37, 0.19, 0.46], black);
    // Index points along local +Z. Its base and phalanges curl in the idle pose.
    const index = new THREE.Group();
    index.position.set(-side * 0.24, 0, 0.7);
    hand.add(index);
    for (let i = 0; i < 3; i++) {
      ball(index, [0, 0, 0.12 + i * 0.22], [0.085, 0.084, 0.145], casing);
      ball(index, [0, 0, 0.22 + i * 0.22], [0.084, 0.086, 0.06], joint);
    }
    for (let i = 0; i < 3; i++) {
      const x = side * (-0.02 + i * 0.19);
      ball(hand, [x, 0, 0.84], [0.084, 0.09, 0.2], casing);
      ball(hand, [x, -0.12, 0.96], [0.083, 0.19, 0.085], joint);
      ball(hand, [x, -0.24, 0.83], [0.078, 0.08, 0.18], black);
    }
    const thumb = ball(
      hand,
      [-side * 0.36, -0.1, 0.51],
      [0.13, 0.13, 0.3],
      casing,
    );
    thumb.rotation.y = -side * 0.65;
    const idle = new THREE.Vector3(side * 2.8, 3.48, 2.07);
    return {
      side,
      shoulder,
      upper,
      lower,
      hand,
      index,
      idle,
      wrist: idle.clone(),
      weight: 0,
    };
  }
  const arms = [makeArm(-1), makeArm(1)];
  let requested: THREE.Vector3 | null = null;
  const target = new THREE.Vector3(0, 1.1, 8);
  let activeSide = 1;
  const headRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const lowerRotation = new THREE.Quaternion();
  const fingerRotation = new THREE.Quaternion();
  const localTarget = new THREE.Vector3();
  const desiredWrist = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
  return {
    root,
    aim(point) {
      requested = point?.clone() ?? null;
    },
    update(delta, time, reducedMotion) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(delta, 0.05));
      root.updateMatrixWorld(true);
      if (requested) {
        localTarget.copy(requested);
        root.worldToLocal(localTarget);
        target.lerp(localTarget, ease);
        if (target.x > 0.75) activeSide = 1;
        else if (target.x < -0.75) activeSide = -1;
      }
      // Head yaw/pitch are bounded. There is no idle motion in reduced-motion mode.
      const yaw = requested
        ? THREE.MathUtils.clamp(Math.atan2(target.x, target.z), -0.6, 0.6)
        : 0;
      const pitch = requested
        ? -0.35 +
          THREE.MathUtils.clamp(
            Math.atan2(6.35 - target.y, Math.hypot(target.x, target.z)),
            0,
            0.5,
          ) *
            0.6
        : -0.35;
      lookEuler.set(
        pitch,
        yaw,
        requested || reducedMotion ? 0 : Math.sin(time * 0.6) * 0.008,
      );
      headRotation.setFromEuler(lookEuler);
      head.quaternion.slerp(headRotation, ease);
      body.position.y = reducedMotion ? 0 : Math.sin(time * 0.7) * 0.018;
      for (const arm of arms) {
        const active = requested !== null && arm.side === activeSide;
        arm.weight = THREE.MathUtils.lerp(arm.weight, active ? 1 : 0, ease);
        desiredWrist.copy(arm.idle);
        if (active) {
          direction.copy(target).sub(arm.shoulder).normalize();
          desiredWrist.copy(arm.shoulder).addScaledVector(direction, 3.15);
          // Keep the wrist outside the torso and above the tallest building.
          desiredWrist.x =
            arm.side *
            THREE.MathUtils.clamp(arm.side * desiredWrist.x, 1.2, 4.7);
          desiredWrist.y = THREE.MathUtils.clamp(desiredWrist.y, 4.45, 5.7);
          desiredWrist.z = THREE.MathUtils.clamp(desiredWrist.z, 1.25, 3.35);
        }
        arm.wrist.lerp(desiredWrist, ease);
        const pose = solveArmIK(
          arm.shoulder,
          arm.wrist,
          new THREE.Vector3(arm.side * 6, 3.4, 0.7),
          upperLength,
          lowerLength,
        );
        direction.copy(pose.elbow).sub(arm.shoulder).normalize();
        arm.upper.quaternion.setFromUnitVectors(yAxis, direction);
        direction.copy(pose.wrist).sub(pose.elbow).normalize();
        lowerRotation.setFromUnitVectors(yAxis, direction);
        arm.lower.quaternion
          .copy(arm.upper.quaternion)
          .invert()
          .multiply(lowerRotation);
        // Limit wrist deviation to 65 degrees from the forearm axis. Far points
        // are indicated along a ray; neither bones nor finger geometry stretch.
        const toward = target.clone().sub(pose.wrist).normalize();
        const idleDirection = new THREE.Vector3(
          arm.side * 0.1,
          -0.28,
          1,
        ).normalize();
        toward.lerp(idleDirection, 1 - arm.weight).normalize();
        const angle = direction.angleTo(toward),
          limit = THREE.MathUtils.degToRad(65);
        if (angle > limit)
          toward
            .copy(direction)
            .applyQuaternion(
              new THREE.Quaternion()
                .setFromUnitVectors(direction, toward)
                .slerp(new THREE.Quaternion(), 1 - limit / angle),
            );
        fingerRotation.setFromUnitVectors(zAxis, toward);
        parentRotation.copy(lowerRotation).invert();
        arm.hand.quaternion.copy(parentRotation).multiply(fingerRotation);
        arm.index.rotation.x = (1 - arm.weight) * 0.85;
      }
    },
    dispose() {
      for (const resource of resources) resource.dispose();
      root.removeFromParent();
    },
  };
}
