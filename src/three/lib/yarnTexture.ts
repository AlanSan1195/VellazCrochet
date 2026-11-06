import * as THREE from "three";
import type { YarnFinish } from "./fabric";
import { COARSE_POINTER } from "./quality";
import { seededRandom } from "./random";

/** En móvil las puntadas se ven pequeñas: 256 basta y se genera cuatro veces más rápido. */
const SIZE = COARSE_POINTER ? 256 : 512;
/** Las medidas en píxeles de abajo son para una textura de 512. */
const PX = SIZE / 512;

export type YarnTextures = {
  /** Multiplica el color del hilo: sombras de las fibras y manchas suaves de tinte. */
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  /** Verde: rugosidad. Azul: pelusa, que decide dónde aparece el brillo aterciopelado. */
  roughness: THREE.DataTexture;
};

const cache = new Map<YarnFinish, YarnTextures>();

const fract = (value: number) => value - Math.floor(value);
const smooth = (t: number) => t * t * (3 - 2 * t);
const between = (random: () => number, [min, max]: [number, number]) => min + (max - min) * random();

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

type FiberOptions = {
  /** Fibras en una textura de 512 × 512. */
  count: number;
  /** Largo y grosor, en píxeles de una textura de 512. */
  length: [number, number];
  width: [number, number];
  /** Cuánto se desvían de la dirección del hilo (el eje V), en radianes. */
  spread: number;
  /** Proporción de fibras sueltas, que cruzan el hilo en cualquier dirección. */
  stray: number;
};

/**
 * Pelusa: fibras cortas y algo curvas, casi todas a lo largo del hilo. Cada fibra es un
 * pequeño cilindro (altura 0–1) que se afina en las puntas; donde dos se cruzan queda
 * la más alta, así se leen como hebras sueltas y no como manchas.
 */
function createFiberLayer(random: () => number, options: FiberOptions) {
  const layer = new Float32Array(SIZE * SIZE);
  const count = Math.round(options.count * PX * PX);

  for (let i = 0; i < count; i++) {
    let x = random() * SIZE;
    let y = random() * SIZE;
    const stray = random() < options.stray;
    let angle = stray ? random() * Math.PI : Math.PI / 2 + (random() + random() - 1) * options.spread;
    const bend = (random() - 0.5) * (stray ? 0.12 : 0.05);
    const length = between(random, options.length) * PX;
    const radius = Math.max(between(random, options.width) * PX * 0.5, 0.75);
    const strength = 0.45 + 0.55 * random();
    const step = radius * 0.6;
    const reach = Math.ceil(radius + 1);

    for (let t = 0; t < length; t += step) {
      const taper = Math.sin((Math.PI * t) / length) ** 0.5 * strength;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let oy = -reach; oy <= reach; oy++) {
        for (let ox = -reach; ox <= reach; ox++) {
          const dx = cx + ox + 0.5 - x;
          const dy = cy + oy + 0.5 - y;
          const inside = 1 - (dx * dx + dy * dy) / (radius * radius);
          if (inside <= 0) continue;
          const px = (((cx + ox) % SIZE) + SIZE) % SIZE;
          const py = (((cy + oy) % SIZE) + SIZE) % SIZE;
          const index = py * SIZE + px;
          const height = Math.sqrt(inside) * taper;
          if (height > layer[index]!) layer[index] = height;
        }
      }
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      angle += bend * step;
    }
  }
  return layer;
}

type Sample = { height: number; albedo: number; roughness: number; fuzz: number };

/**
 * Trapillo (tira de camiseta): columnas de puntos de jersey en "V" a lo largo de la
 * tira, pliegues anchos de la tela enrollada y la pelusa de algodón por encima.
 */
function sampleJersey(noise: ReturnType<typeof createTileNoise>) {
  const COLUMNS = 40;
  const ROWS = 30;
  return (u: number, v: number, fiber: number): Sample => {
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
    const mottle = noise(u * 4, v * 4, 4);
    // Zonas más y menos gastadas: la pelusa no es pareja en toda la tira.
    const wear = noise(u * 6, v * 3, 6, 3);

    return {
      height: loop * 0.18 + folds * 0.55 - crease * 0.16 + fiber * 0.09,
      // Las fibras atrapan luz y se ven un poco más claras; entre ellas queda algo de sombra.
      albedo:
        (0.94 + 0.06 * loop) * (0.95 + 0.05 * mottle) * (1 - 0.06 * crease) * (0.965 + 0.05 * fiber),
      roughness: 0.88 + 0.08 * (1 - loop) + 0.04 * fiber,
      fuzz: (0.35 + 0.65 * fiber) * (0.75 + 0.25 * wear),
    };
  };
}

/**
 * Cinta satinada: estrías finas a lo largo de la cinta, un tramado diminuto que las
 * cruza, vetas alargadas donde el brillo cambia y algún filamento suelto.
 */
function sampleSatin(noise: ReturnType<typeof createTileNoise>) {
  const RIBS = 44;
  return (u: number, v: number, fiber: number): Sample => {
    const cx = u * RIBS;
    const rib = 0.5 + 0.5 * Math.cos(cx * Math.PI * 2);
    const weave = 0.5 + 0.5 * Math.cos(v * 110 * Math.PI * 2 + (Math.floor(cx) % 2) * Math.PI);
    const streak = noise(u * 64, v * 3, 64, 3) * 0.7 + noise(u * 128, v * 6, 128, 6) * 0.3;
    const twist = noise(u * 3, v * 2, 3, 2);

    return {
      height: rib * 0.36 + weave * 0.08 + twist * 0.5 + fiber * 0.08,
      albedo: (0.91 + 0.09 * rib) * (0.95 + 0.05 * streak) * (0.97 + 0.05 * fiber),
      // Más rugosa que antes: brillo de cinta, pero sin reflejos de plástico.
      roughness: 0.42 + 0.16 * streak + 0.12 * (1 - rib) + 0.15 * fiber,
      fuzz: 0.2 + 0.8 * fiber,
    };
  };
}

const FIBERS: Record<YarnFinish, FiberOptions> = {
  // Algodón cepillado: mucha pelusa corta, bastante revuelta.
  jersey: { count: 4200, length: [10, 32], width: [1.6, 2.4], spread: 0.4, stray: 0.12 },
  // Cinta: pocos filamentos, largos y casi rectos.
  satin: { count: 700, length: [24, 70], width: [1.8, 2.6], spread: 0.12, stray: 0.04 },
};

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

const toByte = (value: number) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);

/** Texturas del hilo, generadas una vez por acabado y compartidas por todos los bolsos. */
export function getYarnTextures(finish: YarnFinish): YarnTextures {
  const cached = cache.get(finish);
  if (cached) return cached;

  const seed = finish === "jersey" ? 7 : 19;
  const noise = createTileNoise(seed);
  const sample = finish === "jersey" ? sampleJersey(noise) : sampleSatin(noise);
  const fibers = createFiberLayer(seededRandom(seed * 977), FIBERS[finish]);
  const strength = finish === "jersey" ? 2.6 : 1.8;

  const heights = new Float32Array(SIZE * SIZE);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const roughness = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x;
      const texel = sample(x / SIZE, y / SIZE, fibers[index]!);
      heights[index] = texel.height;
      const shade = toByte(texel.albedo);
      albedo[index * 4] = shade;
      albedo[index * 4 + 1] = shade;
      albedo[index * 4 + 2] = shade;
      albedo[index * 4 + 3] = 255;
      const rough = toByte(texel.roughness);
      roughness[index * 4] = rough;
      roughness[index * 4 + 1] = rough;
      roughness[index * 4 + 2] = toByte(texel.fuzz);
      roughness[index * 4 + 3] = 255;
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
      const index = (y * SIZE + x) * 4;
      normal[index] = Math.round((-dx / length) * 127.5 + 127.5);
      normal[index + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      normal[index + 2] = Math.round((1 / length) * 127.5 + 127.5);
      normal[index + 3] = 255;
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
