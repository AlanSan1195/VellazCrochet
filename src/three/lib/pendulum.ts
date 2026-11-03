import * as THREE from "three";

/** Empuja `point` fuera del cuerpo. Devuelve la normal si hubo contacto. */
export type BodyCollider = (point: THREE.Vector3, padding: number) => THREE.Vector3 | null;

export type PendulumConfig = {
  anchor: THREE.Vector3;
  length: number;
  gravity: number;
  damping: number;
  padding: number;
  collider: BodyCollider;
};

export type PendulumState = { position: THREE.Vector3; velocity: THREE.Vector3 };

const FIXED_STEP = 1 / 120;
const MAX_STEPS = 6;

const gravity = new THREE.Vector3();
const acceleration = new THREE.Vector3();
const direction = new THREE.Vector3();
const term = new THREE.Vector3();
const angularAcceleration = new THREE.Vector3();

function constrain(state: PendulumState, config: PendulumConfig) {
  const { position, velocity } = state;
  const projectToRod = () => {
    direction.subVectors(position, config.anchor).normalize();
    position.copy(config.anchor).addScaledVector(direction, config.length);
    velocity.addScaledVector(direction, -velocity.dot(direction));
  };

  projectToRod();
  const normal = config.collider(position, config.padding);
  if (normal) {
    const into = velocity.dot(normal);
    // Rebote casi nulo: es tela contra tela.
    if (into < 0) velocity.addScaledVector(normal, -into * 1.15);
    projectToRod();
  }
}

/**
 * Péndulo esférico en el marco del bolso. Como el bolso gira, la gravedad cambia
 * de dirección y aparecen fuerzas de inercia (Coriolis, centrífuga y Euler): por
 * eso la flor se balancea sola al mover el modelo.
 */
export function stepPendulum(
  state: PendulumState,
  config: PendulumConfig,
  /** Rotación del bolso en el mundo. */
  rotation: THREE.Quaternion,
  /** Velocidad angular del bolso, en sus coordenadas locales. */
  omega: THREE.Vector3,
  previousOmega: THREE.Vector3,
  delta: number,
) {
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.round(delta / FIXED_STEP)));
  const dt = Math.min(delta, MAX_STEPS * FIXED_STEP) / steps;

  gravity.set(0, -config.gravity, 0).applyQuaternion(rotation.clone().invert());
  angularAcceleration
    .subVectors(omega, previousOmega)
    .divideScalar(Math.max(delta, 1e-3))
    .clampLength(0, 40);

  for (let i = 0; i < steps; i++) {
    const { position, velocity } = state;
    acceleration.copy(gravity);
    acceleration.addScaledVector(term.crossVectors(omega, velocity), -2);
    acceleration.addScaledVector(term.crossVectors(omega, position).cross(omega), 1);
    acceleration.addScaledVector(term.crossVectors(angularAcceleration, position), -1);

    velocity.addScaledVector(acceleration, dt);
    velocity.multiplyScalar(Math.exp(-config.damping * dt));
    position.addScaledVector(velocity, dt);
    constrain(state, config);
  }
}

/** Coloca el péndulo en reposo para que no caiga al cargar la página. */
export function settlePendulum(state: PendulumState, config: PendulumConfig, rotation: THREE.Quaternion) {
  const still = new THREE.Vector3();
  for (let i = 0; i < 240; i++) stepPendulum(state, config, rotation, still, still, FIXED_STEP);
  state.velocity.set(0, 0, 0);
}
