import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BodyShape } from "../lib/bodyShape";
import { createFabricMaterial, type YarnFinish } from "../lib/fabric";
import { seededRandom } from "../lib/random";
import {
  createInstancedPair,
  createLobe,
  createStitchGeometry,
  placeLobe,
  placeRope,
  placeTubeStitches,
  splitByTone,
} from "../lib/stitches";
import { useStage } from "../stage";

type BraidHandle = {
  kind: "braid";
  curve: THREE.Curve<THREE.Vector3>;
  radius: number;
  step: number;
};

type TubeHandle = {
  kind: "tube";
  curve: THREE.Curve<THREE.Vector3>;
  radius: number;
  rowSpacing: number;
  perRow: number;
  stitchScale: number;
};

/** Receta de un bolso tejido: silueta, tamaño de puntada y asas. */
export type BagBlueprint = {
  shape: BodyShape;
  finish: YarnFinish;
  seed: number;
  body: {
    rowSpacing: number;
    stitchSpacing: number;
    /** Desfase entre hileras: produce las diagonales del tejido. */
    rowShift: number;
    stitchScale: number;
    /** Inclinación de cada puntada respecto a la vertical. */
    lean: number;
  };
  handles: (BraidHandle | TubeHandle)[];
};

const SHELL_SHADE = 0.42;

function buildBodyStitches({ shape, body }: BagBlueprint, random: () => number) {
  const matrices: THREE.Matrix4[] = [];
  const meridian = shape.buildMeridianTable();
  const rows = Math.round(meridian.total / body.rowSpacing);

  for (let row = 1; row <= rows; row++) {
    const u = meridian.uAtLength((row / rows) * meridian.total * 0.985);
    const ring = shape.buildRingTable(u);
    const count = Math.max(4, Math.round(ring.total / body.stitchSpacing));
    const start = row * body.stitchSpacing * body.rowShift;

    for (let i = 0; i < count; i++) {
      const length = start + (i / count) * ring.total + (random() - 0.5) * body.stitchSpacing * 0.08;
      const { point, up, around, normal } = shape.surfaceFrame(u, ring.angleAtLength(length));
      const lean = body.lean + (random() - 0.5) * 0.14;
      const along = up.clone().multiplyScalar(Math.cos(lean)).addScaledVector(around, Math.sin(lean));
      point.addScaledVector(normal, (0.006 + random() * 0.006) * body.stitchScale);
      const scale = body.stitchScale * (0.98 + random() * 0.08);
      matrices.push(placeLobe(point, along, normal, scale));
    }
  }
  return matrices;
}

const mixTones = (tones: string[]) => {
  const color = new THREE.Color(tones[0]);
  if (tones[1]) color.lerp(new THREE.Color(tones[1]), 0.5);
  return color.multiplyScalar(SHELL_SHADE);
};

type Props = { blueprint: BagBlueprint; tones: string[] };

/** Construye y pinta cualquier bolso a partir de su receta. */
export function KnitBag({ blueprint, tones }: Props) {
  const { press } = useStage();

  const built = useMemo(() => {
    const random = seededRandom(blueprint.seed);
    const group = new THREE.Group();
    const finish = blueprint.finish;

    const materialA = createFabricMaterial({ hex: "#ffffff", finish, press });
    const materialB = createFabricMaterial({ hex: "#ffffff", finish, press });
    const shellMaterial = createFabricMaterial({ hex: "#ffffff", finish, press, vertexColors: false });
    const materials: [THREE.Material, THREE.Material] = [materialA, materialB];

    const stitchSource = createStitchGeometry();
    const stitch = splitByTone(stitchSource);
    stitchSource.dispose();
    group.add(createInstancedPair(stitch, materials, buildBodyStitches(blueprint, random), random));

    const shellGeometry = blueprint.shape.createShellGeometry();
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.userData.pressable = true;
    shell.frustumCulled = false;
    group.add(shell);

    const braidSource = createLobe({ length: 0.06, width: 0.034, thickness: 0.034, bend: 0.25 });
    const braid = splitByTone(braidSource);
    braidSource.dispose();

    const disposables: { dispose: () => void }[] = [
      materialA,
      materialB,
      shellMaterial,
      shellGeometry,
      ...stitch,
      ...braid,
    ];

    for (const handle of blueprint.handles) {
      const matrices =
        handle.kind === "braid"
          ? placeRope(handle.curve, { radius: handle.radius * 0.62, step: handle.step, random })
          : placeTubeStitches(handle.curve, {
              radius: handle.radius * 0.82,
              rowSpacing: handle.rowSpacing,
              perRow: handle.perRow,
              scale: handle.stitchScale,
              random,
            });
      group.add(createInstancedPair(handle.kind === "braid" ? braid : stitch, materials, matrices, random));

      const core = new THREE.TubeGeometry(handle.curve, 80, handle.radius * 0.72, 10);
      const coreMesh = new THREE.Mesh(core, shellMaterial);
      coreMesh.userData.pressable = true;
      coreMesh.frustumCulled = false;
      group.add(coreMesh);
      disposables.push(core);
    }

    return { group, materialA, materialB, shellMaterial, disposables };
  }, [blueprint, press]);

  useEffect(() => () => built.disposables.forEach((item) => item.dispose()), [built]);

  // Al montar se pinta de golpe; después cada cambio de color se anima.
  const first = useMemo(() => ({ done: false }), [built]);
  const targetA = useMemo(() => new THREE.Color(), []);
  const targetB = useMemo(() => new THREE.Color(), []);
  const targetShell = useMemo(() => new THREE.Color(), []);
  useFrame((_, delta) => {
    targetA.set(tones[0]!);
    targetB.set(tones[1] ?? tones[0]!);
    targetShell.copy(mixTones(tones));
    const blend = first.done ? 1 - Math.exp(-7 * delta) : 1;
    first.done = true;
    built.materialA.color.lerp(targetA, blend);
    built.materialB.color.lerp(targetB, blend);
    built.shellMaterial.color.lerp(targetShell, blend);
  });

  return <primitive object={built.group} />;
}
