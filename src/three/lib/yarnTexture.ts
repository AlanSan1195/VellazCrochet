import * as THREE from "three";
import { seededRandom } from "./random";

const SIZE = 512;
const RIBS = 12;

type YarnTextures = { albedo: THREE.CanvasTexture; bump: THREE.CanvasTexture };
let cached: YarnTextures | undefined;

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  return { canvas, context: canvas.getContext("2d")! };
}

function finishTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Tejido de punto de la camiseta: estrías finas a lo largo de la tira de hilo. */
export function getYarnTextures(): YarnTextures {
  if (cached) return cached;
  const random = seededRandom(7);

  const bump = createCanvas();
  const albedo = createCanvas();
  albedo.context.fillStyle = "#ffffff";
  albedo.context.fillRect(0, 0, SIZE, SIZE);

  const ribWidth = SIZE / RIBS;
  for (let x = 0; x < SIZE; x++) {
    const rib = Math.sin((x / ribWidth) * Math.PI * 2) * 0.5 + 0.5;
    const grey = Math.round(70 + rib * 150);
    bump.context.fillStyle = `rgb(${grey},${grey},${grey})`;
    bump.context.fillRect(x, 0, 1, SIZE);
  }

  // Pequeños lazos de la malla, que rompen la regularidad de las estrías.
  for (let i = 0; i < 2600; i++) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const alpha = 0.05 + random() * 0.14;
    bump.context.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    bump.context.fillRect(x, y, 2 + random() * 3, 2 + random() * 3);
  }

  // Variación suave de tono: multiplica el color elegido, nunca lo sustituye.
  for (let i = 0; i < 90; i++) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const radius = 30 + random() * 80;
    const gradient = albedo.context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(120,120,130,${0.04 + random() * 0.06})`);
    gradient.addColorStop(1, "rgba(120,120,130,0)");
    albedo.context.fillStyle = gradient;
    albedo.context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let x = 0; x < SIZE; x += ribWidth) {
    albedo.context.fillStyle = "rgba(90,90,100,0.07)";
    albedo.context.fillRect(x, 0, ribWidth * 0.3, SIZE);
  }

  const albedoTexture = finishTexture(albedo.canvas);
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  cached = { albedo: albedoTexture, bump: finishTexture(bump.canvas) };
  return cached;
}
