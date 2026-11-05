import * as THREE from "three";

/** Paneles de luz del estudio: posición, giro, tamaño e intensidad. */
const PANELS: { position: THREE.Vector3Tuple; rotation: THREE.Vector3Tuple; scale: [number, number]; intensity: number }[] = [
  { position: [0, 4, 3], rotation: [0, 0, 0], scale: [8, 4], intensity: 1.6 },
  { position: [-5, 0, 2], rotation: [0, Math.PI / 2, 0], scale: [6, 6], intensity: 0.9 },
  { position: [5, 0, -2], rotation: [0, -Math.PI / 2, 0], scale: [6, 6], intensity: 0.7 },
  { position: [0, -4, 0], rotation: [-Math.PI / 2, 0, 0], scale: [8, 8], intensity: 0.5 },
];

/**
 * Reflejos suaves de estudio generados una sola vez en la GPU, sin descargar mapas HDR.
 * Sustituye a `<Environment>` de drei, que arrastraba los cargadores HDR/EXR al paquete.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry();
  const materials: THREE.Material[] = [];

  for (const panel of PANELS) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffffff").multiplyScalar(panel.intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...panel.position);
    mesh.rotation.set(...panel.rotation);
    mesh.scale.set(panel.scale[0], panel.scale[1], 1);
    scene.add(mesh);
    materials.push(material);
  }

  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.02, 0.1, 50);
  generator.dispose();
  geometry.dispose();
  materials.forEach((material) => material.dispose());
  return target;
}
