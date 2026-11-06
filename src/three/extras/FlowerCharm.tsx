import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createFabricMaterial } from "../lib/fabric";
import { createFuzz } from "../lib/fuzz";
import { seededRandom } from "../lib/random";
import { createInstanced, createLobe, placeLobe } from "../lib/stitches";
import type { ExtraModelProps } from "../registry";
import { HangingCharm } from "./HangingCharm";

const ROD_LENGTH = 0.62;
const FLOWER_RADIUS = 0.16;
const PETAL_RADIUS = 0.118;
const FRONT = new THREE.Vector3(0, 0, 1);
const BACK = new THREE.Vector3(0, 0, -1);

const petalAngles = [Math.PI * 0.47, Math.PI * 0.99, Math.PI * 1.53, Math.PI * 0.02];

function buildPuffs(center: THREE.Vector3) {
  const matrices: THREE.Matrix4[] = [];
  for (const angle of petalAngles) {
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const side = new THREE.Vector3(-radial.y, radial.x, 0);
    const petalCenter = center.clone().addScaledVector(radial, FLOWER_RADIUS);
    for (let i = -2; i <= 2; i++) {
      const offset = i / 2;
      const roundness = Math.sqrt(1 - offset * offset * 0.72);
      const along = radial.clone().addScaledVector(side, offset * 0.3);
      const position = petalCenter.clone().addScaledVector(side, offset * 0.076);
      const front = position.clone().setZ(0.038 * roundness);
      matrices.push(placeLobe(front, along, FRONT, new THREE.Vector3(1, roundness, roundness)));
      const back = position.clone().setZ(-0.012);
      matrices.push(placeLobe(back, along, BACK, new THREE.Vector3(1, roundness, 0.45)));
    }
  }
  return matrices;
}

function buildChain(center: THREE.Vector3) {
  const matrices: THREE.Matrix4[] = [];
  // Cadeneta del borde de cada pétalo.
  for (const angle of petalAngles) {
    const petalCenter = center
      .clone()
      .add(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(FLOWER_RADIUS));
    const links = 17;
    for (let i = 0; i <= links; i++) {
      const a = angle - 1.95 + (i / links) * 3.9;
      const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      const tangent = new THREE.Vector3(-out.y, out.x, 0);
      const twist = i % 2 === 0 ? 0.5 : -0.5;
      const position = petalCenter.clone().addScaledVector(out, PETAL_RADIUS);
      position.z = 0.012;
      matrices.push(placeLobe(position, tangent.clone().addScaledVector(FRONT, twist), out.clone().addScaledVector(FRONT, 0.6)));
    }
  }
  // Anillo del centro, que deja ver el agujero.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const position = center.clone().addScaledVector(out, 0.052);
    position.z = 0.032;
    matrices.push(placeLobe(position, out, FRONT, new THREE.Vector3(1, 1.4, 1.2)));
  }
  return matrices;
}

function createBacking(center: THREE.Vector3) {
  const parts: THREE.BufferGeometry[] = petalAngles.map((angle) => {
    const circle = new THREE.CircleGeometry(PETAL_RADIUS, 24);
    circle.translate(
      center.x + Math.cos(angle) * FLOWER_RADIUS,
      center.y + Math.sin(angle) * FLOWER_RADIUS,
      0,
    );
    return circle;
  });
  const ring = new THREE.RingGeometry(0.03, 0.13, 28);
  ring.translate(center.x, center.y, 0.002);
  parts.push(ring);
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("No se pudo crear la base de la flor");
  return merged;
}

/** Flor de crochet: pieza independiente del bolso, declarada como extra en el catálogo. */
export function FlowerCharm(props: ExtraModelProps) {
  const { hex } = props.extra;

  const flower = useMemo(() => {
    const random = seededRandom(23);
    const center = new THREE.Vector3(0, -ROD_LENGTH, 0);
    const group = new THREE.Group();

    const material = createFabricMaterial({ hex });
    const backingMaterial = createFabricMaterial({ hex, vertexColors: false, side: THREE.DoubleSide });
    backingMaterial.color.multiplyScalar(0.55);
    const fuzz = createFuzz({ hex, seed: 29 });

    const puffGeometry = createLobe({ length: 0.112, width: 0.035, thickness: 0.044, bend: 0.25, pleats: 3, segments: [12, 8] });
    const chainGeometry = createLobe({ length: 0.024, width: 0.016, thickness: 0.016, pleatDepth: 0.03, segments: [8, 5], ambientFloor: 0.65 });
    const backingGeometry = createBacking(center);

    group.add(fuzz.grow(createInstanced(puffGeometry, material, buildPuffs(center), random)));
    group.add(fuzz.grow(createInstanced(chainGeometry, material, buildChain(center), random)));
    group.add(new THREE.Mesh(backingGeometry, backingMaterial));

    return { group, disposables: [material, backingMaterial, puffGeometry, chainGeometry, backingGeometry, fuzz] };
  }, [hex]);

  useEffect(() => () => flower.disposables.forEach((item) => item.dispose()), [flower]);

  return (
    <HangingCharm
      {...props}
      rodLength={ROD_LENGTH}
      padding={0.09}
      pokeRadius={FLOWER_RADIUS + PETAL_RADIUS}
      loop={{ radius: 0.095, scale: 1.5 }}
      cord={{ hex, radius: 0.019, length: ROD_LENGTH - FLOWER_RADIUS - PETAL_RADIUS + 0.02 }}
    >
      <primitive object={flower.group} />
    </HangingCharm>
  );
}
