import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Stage } from "./stage";

export const INITIAL_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, -0.22, 0));
const DRAG_SENSITIVITY = 0.0075;
const SPIN_DECAY = 2.4;
const IDLE_SPIN = 0.32;
const PRESS_DEPTH = 0.14;
export const DEFAULT_DISTANCE = 4.5;
const MIN_DISTANCE = 2.6;
const MAX_DISTANCE = 7;

/** Avance del scroll en la sección: `enter` 0→1 al llegar, `exit` 0→1 al irse. */
export type ScrollProgress = { enter: number; exit: number };

type Props = {
  stage: Stage;
  element: HTMLElement;
  centerY: number;
  resetSignal: number;
  scroll: ScrollProgress;
  reducedMotion: boolean;
  children: ReactNode;
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Giro libre en cualquier ángulo (cuaterniones, sin polos), con inercia al soltar,
 * hundimiento de la tela donde se toca y la animación de entrada ligada al scroll.
 * En táctil solo se gira en horizontal, para que el scroll vertical siga funcionando.
 */
export function InteractiveStage({ stage, element, centerY, resetSignal, scroll, reducedMotion, children }: Props) {
  // El canvas ocupa exactamente el área del bolso: su tamaño sirve para encuadrar.
  const { camera, size } = useThree();
  const presentGroup = useRef<THREE.Group>(null);
  const spinGroup = useRef<THREE.Group>(null);
  const modelGroup = useRef<THREE.Group>(null);

  const input = useRef({
    pointers: new Map<number, { x: number; y: number; type: string }>(),
    pendingX: 0,
    pendingY: 0,
    dragging: false,
    pressed: false,
    pressVelocity: 0,
    pinchDistance: 0,
    distance: DEFAULT_DISTANCE,
    touched: false,
    resetting: false,
    enter: reducedMotion ? 1 : 0,
    exit: 0,
    previousYaw: reducedMotion ? 0 : -Math.PI * 1.5,
    /** Velocidad angular que da el usuario (mundo, antes de la animación de scroll). */
    omega: new THREE.Vector3(),
  });

  const isFirstReset = useRef(true);
  useEffect(() => {
    if (isFirstReset.current) {
      isFirstReset.current = false;
      return;
    }
    input.current.resetting = true;
    input.current.touched = true;
    input.current.distance = DEFAULT_DISTANCE;
    input.current.omega.set(0, 0, 0);
  }, [resetSignal]);

  useEffect(() => {
    const state = input.current;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const normal = new THREE.Vector3();

    const touchFabric = (event: PointerEvent) => {
      if (!spinGroup.current || !modelGroup.current) return;
      const rect = element.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);

      const targets: THREE.Object3D[] = [];
      spinGroup.current.traverse((object) => {
        if (object.userData.pressable || object.userData.poke) targets.push(object);
      });
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) return;

      if (hit.object.userData.poke) {
        (hit.object.userData.poke as () => void)();
        return;
      }
      if (!hit.face) return;
      stage.press.uPressPoint.value.copy(modelGroup.current.worldToLocal(hit.point.clone()));
      normal.copy(hit.face.normal).normalize().negate();
      stage.press.uPressDir.value.copy(normal);
      state.pressed = true;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      state.touched = true;
      state.resetting = false;
      if (state.pointers.size === 1) {
        state.dragging = true;
        state.omega.set(0, 0, 0);
        touchFabric(event);
      } else {
        state.dragging = false;
        state.pressed = false;
        const [a, b] = [...state.pointers.values()];
        state.pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = state.pointers.get(event.pointerId);
      if (!previous) return;
      if (state.pointers.size === 1) {
        state.pendingX += event.clientX - previous.x;
        if (previous.type === "mouse" || previous.type === "pen") state.pendingY += event.clientY - previous.y;
      }
      previous.x = event.clientX;
      previous.y = event.clientY;
      if (state.pointers.size === 2) {
        const [a, b] = [...state.pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (state.pinchDistance > 0) {
          state.distance = THREE.MathUtils.clamp(
            state.distance * (state.pinchDistance / distance),
            MIN_DISTANCE,
            MAX_DISTANCE,
          );
        }
        state.pinchDistance = distance;
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      state.pointers.delete(event.pointerId);
      if (state.pointers.size === 0) {
        state.dragging = false;
        state.pressed = false;
      }
    };

    // Solo el gesto de pellizco del trackpad (llega con ctrlKey): la rueda sigue haciendo scroll.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      state.distance = THREE.MathUtils.clamp(
        state.distance * Math.exp(event.deltaY * 0.01),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("wheel", onWheel);
    };
  }, [camera, element, stage]);

  const axis = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Quaternion(), []);
  const measured = useMemo(() => new THREE.Vector3(), []);
  const yawAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const state = input.current;
    const { quaternion } = stage.spin;
    const omega = state.omega;

    if (state.resetting) {
      quaternion.slerp(INITIAL_ROTATION, 1 - Math.exp(-6 * delta));
      if (quaternion.angleTo(INITIAL_ROTATION) < 0.002) state.resetting = false;
    } else if (state.dragging) {
      measured.set(state.pendingY, state.pendingX, 0).multiplyScalar(DRAG_SENSITIVITY / delta);
      omega.lerp(measured, 1 - Math.exp(-28 * delta));
      state.pendingX = 0;
      state.pendingY = 0;
    } else if (state.touched || reducedMotion) {
      omega.multiplyScalar(Math.exp(-SPIN_DECAY * delta));
    } else {
      omega.set(0, IDLE_SPIN, 0);
    }

    const speed = omega.length();
    if (speed > 1e-4) {
      axis.copy(omega).divideScalar(speed);
      quaternion.premultiply(step.setFromAxisAngle(axis, speed * delta)).normalize();
    }
    spinGroup.current?.quaternion.copy(quaternion);

    // Entrada con el scroll: sube desde abajo, crece y da vuelta y media; al irse se encoge.
    const smoothing = 1 - Math.exp(-10 * delta);
    state.enter += ((reducedMotion ? 1 : scroll.enter) - state.enter) * smoothing;
    state.exit += ((reducedMotion ? 0 : scroll.exit) - state.exit) * smoothing;
    const enter = easeOut(state.enter);
    const yaw = (1 - enter) * -Math.PI * 1.5;
    if (presentGroup.current) {
      const scale = THREE.MathUtils.lerp(0.45, 1, enter) * THREE.MathUtils.lerp(1, 0.82, state.exit);
      presentGroup.current.scale.setScalar(scale);
      presentGroup.current.position.y = (1 - enter) * -1.1 + state.exit * 0.25;
      presentGroup.current.rotation.set(state.exit * 0.35, yaw, (1 - enter) * 0.25);
      stage.spin.world.copy(presentGroup.current.quaternion).multiply(quaternion);
    }

    // Velocidad angular total, para que los colgantes se balanceen también con el scroll.
    const yawRate = (yaw - state.previousYaw) / Math.max(delta, 1e-3);
    state.previousYaw = yaw;
    stage.spin.omega.copy(omega);
    if (presentGroup.current) stage.spin.omega.applyQuaternion(presentGroup.current.quaternion);
    stage.spin.omega.addScaledVector(yawAxis, THREE.MathUtils.clamp(yawRate, -8, 8));

    // Resorte poco amortiguado: la tela vuelve con un pequeño rebote al soltar.
    const depth = stage.press.uPressDepth;
    const pressTarget = state.pressed ? PRESS_DEPTH : 0;
    state.pressVelocity += ((pressTarget - depth.value) * 120 - state.pressVelocity * 11) * delta;
    depth.value += state.pressVelocity * delta;

    // En contenedores verticales se aleja la cámara para que el bolso quepa completo.
    const fit = Math.max(1, 0.85 / (size.width / Math.max(size.height, 1)));
    camera.position.z = THREE.MathUtils.damp(camera.position.z, state.distance * fit, 8, delta);
  });

  return (
    <group ref={presentGroup}>
      <group ref={spinGroup}>
        <group ref={modelGroup} position={[0, -centerY, 0]}>
          {children}
        </group>
      </group>
    </group>
  );
}
