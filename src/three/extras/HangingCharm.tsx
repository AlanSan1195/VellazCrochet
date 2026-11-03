import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { createFabricMaterial, type YarnFinish } from "../lib/fabric";
import { settlePendulum, stepPendulum, type PendulumConfig, type PendulumState } from "../lib/pendulum";
import { seededRandom } from "../lib/random";
import { createInstanced, createLobe, placeLobe, placeRope } from "../lib/stitches";
import type { ExtraModelProps } from "../registry";
import { useStage } from "../stage";

const HANG = new THREE.Vector3(0, -1, 0);

type HangingCharmProps = ExtraModelProps & {
  /** Distancia del punto de sujeción al centro del colgante. */
  rodLength: number;
  /** Separación mínima entre el centro del colgante y el cuerpo del bolso. */
  padding: number;
  /** Radio del colgante para recibir clics. */
  pokeRadius: number;
  loop: { radius: number; scale: number };
  cord: { length: number; radius: number; hex: string; finish?: YarnFinish };
  /** Contenido que se balancea, centrado en (0, -rodLength, 0). */
  children: ReactNode;
};

/**
 * Base de todo extra colgante: una lazada fija al asa, un cordón y un péndulo
 * que reacciona al giro del bolso, a la gravedad y a los clics.
 */
export function HangingCharm({
  extra,
  collider,
  rodLength,
  padding,
  pokeRadius,
  loop,
  cord,
  children,
}: HangingCharmProps) {
  const { spin } = useStage();
  const pivot = useRef<THREE.Group>(null);
  const anchor = useMemo(() => new THREE.Vector3(...extra.anchor), [extra.anchor]);

  const parts = useMemo(() => {
    const random = seededRandom(41);
    const material = createFabricMaterial({ hex: cord.hex, finish: cord.finish });
    const loopGeometry = createLobe({ length: 0.024, width: 0.016, thickness: 0.016, pleatDepth: 0.03, segments: [8, 5], ambientFloor: 0.65 });
    const cordGeometry = createLobe({ length: 0.036, width: 0.019, thickness: 0.02, pleats: 3, segments: [8, 5], ambientFloor: 0.65 });

    // Lazada que abraza el asa, inclinada para que se lea también de frente.
    const loopCenter = new THREE.Vector3(0, 0, -loop.radius);
    const loopMatrices: THREE.Matrix4[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.55, Math.sin(a));
      const tangent = new THREE.Vector3(-Math.sin(a), Math.cos(a) * 0.55 + (i % 2 === 0 ? 0.4 : -0.4), Math.cos(a));
      loopMatrices.push(placeLobe(loopCenter.clone().addScaledVector(out, loop.radius), tangent, out, loop.scale));
    }
    const fixed = createInstanced(loopGeometry, material, loopMatrices, random);

    const cordCurve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -cord.length, 0));
    const cordMesh = createInstanced(
      cordGeometry,
      material,
      placeRope(cordCurve, { radius: cord.radius, step: 0.028, random }),
      random,
    );

    const proxyGeometry = new THREE.SphereGeometry(pokeRadius, 10, 8);
    proxyGeometry.translate(0, -rodLength, 0);
    const proxy = new THREE.Mesh(proxyGeometry);
    proxy.visible = false;

    return { fixed, cordMesh, proxy, disposables: [material, loopGeometry, cordGeometry, proxyGeometry] };
  }, [cord.finish, cord.hex, cord.length, cord.radius, loop.radius, loop.scale, pokeRadius, rodLength]);

  useEffect(() => () => parts.disposables.forEach((item) => item.dispose()), [parts]);

  const simulation = useMemo(() => {
    const config: PendulumConfig = { anchor, length: rodLength, gravity: 7, damping: 1.5, padding, collider };
    const state: PendulumState = {
      position: anchor.clone().add(new THREE.Vector3(0, -rodLength, 0.05)),
      velocity: new THREE.Vector3(),
    };
    settlePendulum(state, config, spin.world);
    return { config, state };
  }, [anchor, collider, padding, rodLength, spin]);

  useEffect(() => {
    const { velocity, position } = simulation.state;
    parts.proxy.userData.poke = () => {
      // Empujón hacia afuera y a un lado, con fuerza suficiente para notarse.
      velocity.x += (position.x < anchor.x ? -1 : 1) * 1.6;
      velocity.z += 1.2;
    };
  }, [anchor, parts.proxy, simulation]);

  const localOmega = useMemo(() => new THREE.Vector3(), []);
  const previousOmega = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const inverse = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    if (!pivot.current) return;
    inverse.copy(spin.world).invert();
    localOmega.copy(spin.omega).applyQuaternion(inverse);
    stepPendulum(simulation.state, simulation.config, spin.world, localOmega, previousOmega, Math.min(delta, 1 / 20));
    previousOmega.copy(localOmega);
    direction.subVectors(simulation.state.position, anchor).normalize();
    pivot.current.quaternion.setFromUnitVectors(HANG, direction);
  });

  return (
    <group position={extra.anchor}>
      <primitive object={parts.fixed} />
      <group ref={pivot}>
        <primitive object={parts.cordMesh} />
        <primitive object={parts.proxy} />
        {children}
      </group>
    </group>
  );
}
