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
  // Hash entero: se llama millones de veces y es mucho más rápido que el clásico seno.
  const hash = (x: number, y: number, periodX: number, periodY: number) => {
    const px = ((x % periodX) + periodX) % periodX;
    const py = ((y % periodY) + periodY) % periodY;
    let h = Math.imul(px, 0x27d4eb2d) ^ Math.imul(py + seed * 1013, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
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
    const radiusSquared = radius * radius;
    const strength = 0.45 + 0.55 * random();
    const step = radius * 0.6;
    const reach = Math.ceil(radius + 1);

    for (let t = 0; t < length; t += step) {
      const taper = Math.sin((Math.PI * t) / length) ** 0.5 * strength;
      // La fibra puede salirse del borde: se envuelve, porque la textura se repite.
      x = ((x % SIZE) + SIZE) % SIZE;
      y = ((y % SIZE) + SIZE) % SIZE;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let oy = -reach; oy <= reach; oy++) {
        const dy = cy + oy + 0.5 - y;
        let py = cy + oy;
        if (py < 0) py += SIZE;
        else if (py >= SIZE) py -= SIZE;
        for (let ox = -reach; ox <= reach; ox++) {
          const dx = cx + ox + 0.5 - x;
          const inside = 1 - (dx * dx + dy * dy) / radiusSquared;
          if (inside <= 0) continue;
          let px = cx + ox;
          if (px < 0) px += SIZE;
          else if (px >= SIZE) px -= SIZE;
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

/** Inclinación de cada pata de la V respecto al eje del hilo. */
const LEG_TILT = 0.5;
const LEG_AXIS = { x: Math.sin(LEG_TILT), y: Math.cos(LEG_TILT) };

/**
 * Relieve de una puntada de jersey: dos patas ovaladas que se juntan abajo y se abren
 * arriba, como una V. `x` va en anchos de columna (centrado en 0) e `y` en alturas de
 * vuelta; las patas pasan de una vuelta a la siguiente, por eso se miran las vecinas.
 */
function knitLoops(x: number, y: number) {
  // Una columna es más ancha que alta: se mide en las mismas unidades en los dos ejes.
  const px = x * 1.4;
  let best = 0;
  for (let row = -1; row <= 1; row++) {
    const py = y - row;
    for (let side = -1; side <= 1; side += 2) {
      const dx = px - side * 0.3;
      const along = (dx * side * LEG_AXIS.x + py * LEG_AXIS.y) / 0.66;
      const across = (dx * LEG_AXIS.y - py * side * LEG_AXIS.x) / 0.27;
      const inside = 1 - along * along - across * across;
      if (inside <= 0) continue;
      // La punta de arriba se mete bajo la vuelta siguiente: queda un poco más baja.
      const height = Math.sqrt(inside) * (0.88 - 0.12 * along);
      if (height > best) best = height;
    }
  }
  return best;
}

/**
 * Hilo tejido (trapillo o lana en tubo): cada hebra es un tubito de punto de jersey,
 * con columnas de V diminutas a lo largo, huecos en sombra entre las patas, fibras
 * claras y oscuras mezcladas (jaspeado) y pelusa por encima.
 */
function sampleJersey(noise: ReturnType<typeof createTileNoise>, darkFibers: Float32Array) {
  // Columnas alrededor de la hebra y vueltas a lo largo: de frente se ven unas doce V.
  const COLUMNS = 24;
  const ROWS = 22;
  return (u: number, v: number, fiber: number, index: number): Sample => {
    // Las columnas no son rectas del todo: el hilo se tuerce y las puntadas varían.
    const cx = u * COLUMNS + (noise(u * 5, v * 3, 5, 3) - 0.5) * 0.5;
    const cy = v * ROWS + (noise(u * 4, v * 9, 4, 9) - 0.5) * 0.35;
    // En las puntas de cada hebra (los polos de la UV) las columnas se juntan en una
    // estrella: ahí el punto se desvanece y solo queda la pelusa.
    const pole = smooth(Math.min(v / 0.3, (1 - v) / 0.3, 1));
    const knit = knitLoops(fract(cx) - 0.5, fract(cy) - 0.5) * pole + 0.6 * (1 - pole);
    // Cada puntada queda un poco más o menos apretada que la vecina.
    const stitch = noise(Math.floor(cx) + 0.5, Math.floor(cy) * 0.37 + 0.5, COLUMNS, ROWS);

    const folds = noise(u * 3, v * 2, 3, 2);
    const mottle = noise(u * 4, v * 4, 4);
    const wear = noise(u * 6, v * 3, 6, 3);
    const dark = darkFibers[index]!;
    // Hebras finas a lo largo del hilo, algunas más claras y otras más oscuras.
    const streak = noise(u * 160, v * 12, 160, 12);

    return {
      height: knit * (0.42 + 0.12 * stitch) + folds * 0.22 + fiber * 0.15 + dark * 0.08,
      albedo:
        (0.8 + 0.2 * Math.min(knit * 1.6, 1)) *
        (0.95 + 0.05 * mottle) *
        (0.96 + 0.08 * stitch) *
        (0.9 + 0.2 * streak) *
        (1 + 0.22 * fiber) *
        (1 - 0.22 * dark),
      roughness: 0.9 + 0.06 * (1 - knit) + 0.04 * fiber,
      fuzz: (0.3 + 0.7 * Math.max(fiber, dark * 0.6)) * (0.7 + 0.3 * wear),
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
  jersey: { count: 5200, length: [10, 32], width: [1.6, 2.4], spread: 0.4, stray: 0.12 },
  // Cinta: pocos filamentos, largos y casi rectos.
  satin: { count: 700, length: [24, 70], width: [1.8, 2.6], spread: 0.12, stray: 0.04 },
};

/** Fibras de un tono más oscuro, mezcladas con las claras: el jaspeado del hilo. */
const DARK_FIBERS: FiberOptions = { count: 2000, length: [8, 26], width: [1.4, 2.2], spread: 0.5, stray: 0.15 };

/** Brillo medio del albedo: el relieve oscurece los huecos, pero el color no debe cambiar. */
const MEAN_ALBEDO = 0.93;

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
  const random = seededRandom(seed * 977);
  const fibers = createFiberLayer(random, FIBERS[finish]);
  const sample =
    finish === "jersey" ? sampleJersey(noise, createFiberLayer(random, DARK_FIBERS)) : sampleSatin(noise);
  const strength = finish === "jersey" ? 2.8 : 1.8;

  const heights = new Float32Array(SIZE * SIZE);
  const shades = new Float32Array(SIZE * SIZE);
  const roughness = new Uint8Array(SIZE * SIZE * 4);
  let shadeSum = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = y * SIZE + x;
      const texel = sample(x / SIZE, y / SIZE, fibers[index]!, index);
      heights[index] = texel.height;
      shades[index] = texel.albedo;
      shadeSum += texel.albedo;
      const rough = toByte(texel.roughness);
      roughness[index * 4] = rough;
      roughness[index * 4 + 1] = rough;
      roughness[index * 4 + 2] = toByte(texel.fuzz);
      roughness[index * 4 + 3] = 255;
    }
  }

  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const gain = MEAN_ALBEDO / (shadeSum / shades.length);
  for (let index = 0; index < shades.length; index++) {
    const shade = toByte(shades[index]! * gain);
    albedo[index * 4] = shade;
    albedo[index * 4 + 1] = shade;
    albedo[index * 4 + 2] = shade;
    albedo[index * 4 + 3] = 255;
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
