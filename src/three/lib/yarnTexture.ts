import * as THREE from "three";
import type { YarnFinish } from "./fabric";
import { COARSE_POINTER } from "./quality";

/** En móvil las puntadas se ven pequeñas: 256 basta y se genera cuatro veces más rápido. */
const SIZE = COARSE_POINTER ? 256 : 512;

export type YarnTextures = {
  /** Multiplica el color del hilo: sombras de las fibras y manchas suaves de tinte. */
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  /** Canal verde: rugosidad. */
  roughness: THREE.DataTexture;
};

const cache = new Map<YarnFinish, YarnTextures>();

const fract = (value: number) => value - Math.floor(value);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor que se repite con periodo entero: la textura no deja costuras. */
function createTileNoise(seed: number) {
  const hash = (x: number, y: number, periodX: number, periodY: number) => {
    const px = ((x % periodX) + periodX) % periodX;
    const py = ((y % periodY) + periodY) % periodY;
    const h = Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  /** `x` e `y` van de 0 a su periodo (frecuencia entera) para que el borde empalme. */
  return (x: number, y: number, periodX: number, periodY = periodX) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash(ix, iy, periodX, periodY);
    const b = hash(ix + 1, iy, periodX, periodY);
    const c = hash(ix, iy + 1, periodX, periodY);
    const d = hash(ix + 1, iy + 1, periodX, periodY);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

type Sample = { height: number; albedo: number; roughness: number };

/**
 * Trapillo (tira de camiseta): columnas de puntos de jersey en "V" a lo largo de la
 * tira, pliegues anchos de la tela enrollada y una pelusa fina de algodón.
 */
function sampleJersey(noise: ReturnType<typeof createTileNoise>) {
  const COLUMNS = 40;
  const ROWS = 30;
  return (u: number, v: number): Sample => {
    const wobble = (noise(u * 10, v * 10, 10) - 0.5) * 0.25;
    const cx = u * COLUMNS + wobble;
    const fx = fract(cx) - 0.5;
    const fy = fract(v * ROWS + (Math.floor(cx) % 2) * 0.5);
    // Las dos patas de la V se separan hacia arriba y se juntan abajo.
    const legX = 0.08 + 0.28 * fy;
    const leg = Math.exp(-(((Math.abs(fx) - legX) / 0.15) ** 2));
    const loop = leg * (0.55 + 0.45 * Math.sin(Math.PI * fy));

    // La tira se enrolla sobre sí misma: pliegues largos a lo largo y alguna arruga.
    const folds = noise(u * 3, v * 1, 3, 1) * 0.6 + noise(u * 7, v * 2, 7, 2) * 0.4;
    const crease = Math.exp(-(((fract(u * 2 + (noise(u * 2, v * 2, 2) - 0.5) * 0.3) - 0.5) / 0.16) ** 2));
    const fuzz = noise(u * 128, v * 128, 128) * 0.6 + noise(u * 256, v * 256, 256) * 0.4;
    const mottle = noise(u * 4, v * 4, 4);

    return {
      height: loop * 0.22 + folds * 0.55 - crease * 0.16 + fuzz * 0.1,
      albedo: (0.93 + 0.07 * loop) * (0.95 + 0.05 * mottle) * (1 - 0.06 * crease) * (0.97 + 0.03 * fuzz),
      roughness: 0.8 + 0.12 * (1 - loop) + 0.08 * fuzz,
    };
  };
}

/**
 * Cinta satinada: estrías finas a lo largo de la cinta, un tramado diminuto que las
 * cruza y vetas alargadas donde el brillo cambia, como en la foto de Bombón.
 */
function sampleSatin(noise: ReturnType<typeof createTileNoise>) {
  const RIBS = 44;
  return (u: number, v: number): Sample => {
    const cx = u * RIBS;
    const rib = 0.5 + 0.5 * Math.cos(cx * Math.PI * 2);
    const weave = 0.5 + 0.5 * Math.cos(v * 110 * Math.PI * 2 + (Math.floor(cx) % 2) * Math.PI);
    const streak = noise(u * 64, v * 3, 64, 3) * 0.7 + noise(u * 128, v * 6, 128, 6) * 0.3;
    const twist = noise(u * 3, v * 2, 3, 2);

    return {
      height: rib * 0.42 + weave * 0.08 + twist * 0.5,
      albedo: (0.9 + 0.1 * rib) * (0.95 + 0.05 * streak),
      roughness: 0.26 + 0.16 * streak + 0.1 * (1 - rib),
    };
  };
}

function createDataTexture(data: Uint8Array, colorSpace: THREE.ColorSpace) {
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = COARSE_POINTER ? 4 : 8;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Texturas del hilo, generadas una vez por acabado y compartidas por todos los bolsos. */
export function getYarnTextures(finish: YarnFinish): YarnTextures {
  const cached = cache.get(finish);
  if (cached) return cached;

  const noise = createTileNoise(finish === "jersey" ? 7 : 19);
  const sample = finish === "jersey" ? sampleJersey(noise) : sampleSatin(noise);
  const strength = finish === "jersey" ? 2.6 : 1.8;

  const heights = new Float32Array(SIZE * SIZE);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const roughness = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x;
      const { height, albedo: shade, roughness: rough } = sample(x / SIZE, y / SIZE);
      heights[index] = height;
      const a = Math.round(THREE.MathUtils.clamp(shade, 0, 1) * 255);
      albedo.set([a, a, a, 255], index * 4);
      const r = Math.round(THREE.MathUtils.clamp(rough, 0, 1) * 255);
      roughness.set([r, r, r, 255], index * 4);
    }
  }

  // Normales a partir de las alturas, con diferencias centrales que dan la vuelta al borde.
  const normal = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      normal.set(
        [
          Math.round((-dx / length) * 127.5 + 127.5),
          Math.round((-dy / length) * 127.5 + 127.5),
          Math.round((1 / length) * 127.5 + 127.5),
          255,
        ],
        (y * SIZE + x) * 4,
      );
    }
  }

  const textures: YarnTextures = {
    albedo: createDataTexture(albedo, THREE.SRGBColorSpace),
    normal: createDataTexture(normal, THREE.NoColorSpace),
    roughness: createDataTexture(roughness, THREE.NoColorSpace),
  };
  cache.set(finish, textures);
  return textures;
}
