import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BodyShape } from "../lib/bodyShape";
import { createFabricMaterial, createYarnTones, type YarnFinish } from "../lib/fabric";
import { createFuzz } from "../lib/fuzz";
import { seededRandom } from "../lib/random";
import {
  createInstanced,
  createLobe,
  createStitchGeometry,
  placeBodyStitches,
  placeRope,
  placeTubeStitches,
  type BodyStitchOptions,
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
  body: BodyStitchOptions;
  handles: (BraidHandle | TubeHandle)[];
};

const SHELL_SHADE = 0.42;

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

    // Un solo material para todas las puntadas: los dos hilos se pintan en el shader.
    const yarnTones = createYarnTones();
    const material = createFabricMaterial({ hex: "#ffffff", finish, press, tones: yarnTones });
    const shellMaterial = createFabricMaterial({ hex: "#ffffff", finish, press, vertexColors: false });
    // Pelusa con los mismos colores (y hundimiento) que las puntadas.
    const fuzz = createFuzz({ finish, tones: yarnTones, press, seed: blueprint.seed * 31 + 7 });

    const stitch = createStitchGeometry();
    group.add(fuzz.grow(createInstanced(stitch, material, placeBodyStitches(blueprint.shape, blueprint.body, random), random)));

    const shellGeometry = blueprint.shape.createShellGeometry();
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.userData.pressable = true;
    shell.frustumCulled = false;
    group.add(shell);

    const braid = createLobe({ length: 0.06, width: 0.034, thickness: 0.034, bend: 0.25 });

    const disposables: { dispose: () => void }[] = [material, shellMaterial, shellGeometry, stitch, braid, fuzz];

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
      group.add(fuzz.grow(createInstanced(handle.kind === "braid" ? braid : stitch, material, matrices, random)));

      const core = new THREE.TubeGeometry(handle.curve, 80, handle.radius * 0.72, 10);
      const coreMesh = new THREE.Mesh(core, shellMaterial);
      coreMesh.userData.pressable = true;
      coreMesh.frustumCulled = false;
      group.add(coreMesh);
      disposables.push(core);
    }

    return { group, yarnTones, shellMaterial, disposables };
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
    built.yarnTones.uToneA.value.lerp(targetA, blend);
    built.yarnTones.uToneB.value.lerp(targetB, blend);
    built.shellMaterial.color.lerp(targetShell, blend);
  });

  return <primitive object={built.group} />;
}
