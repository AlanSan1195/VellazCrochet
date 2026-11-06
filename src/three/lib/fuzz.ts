import * as THREE from "three";
import { createYarnTones, type YarnFinish, type YarnTones } from "./fabric";
import { COARSE_POINTER } from "./quality";
import { seededRandom } from "./random";
import { patchSoftPress, type PressUniforms } from "./softPress";

type FuzzStyle = {
  /** Fibras por unidad² de hilo a la vista (la cara que da al tejido no lleva). */
  density: number;
  /** Largo de las fibras, en unidades del modelo (el hilo mide ~0.06 de grosor). */
  length: [number, number];
  /** Cuánto se levantan: 0 es acostadas sobre el hilo, 1 de punta. */
  lift: [number, number];
  /** Cuánto cambia de rumbo cada tramo: las fibras se rizan un poco. */
  curl: number;
  opacity: number;
};

const STYLES: Record<YarnFinish, FuzzStyle> = {
  // Algodón: mucha pelusa corta y rizada que sobresale del contorno.
  jersey: { density: 4000, length: [0.006, 0.028], lift: [0.15, 0.95], curl: 0.6, opacity: 0.8 },
  // Cinta: algún filamento suelto, corto y pegado a la cinta.
  satin: { density: 160, length: [0.004, 0.012], lift: [0.05, 0.4], curl: 0.3, opacity: 0.55 },
};

/** En móvil la mitad: a ese tamaño se nota igual y pesa menos. */
const DENSITY_SCALE = COARSE_POINTER ? 0.5 : 1;
/** Tramos de cada fibra. */
const SEGMENTS = 3;
/** Las fibras nacen un poco dentro del hilo, para que no se vea dónde empiezan. */
const ROOT_DEPTH = 0.0015;
/** Luz principal de la escena en espacio de cámara (arriba, a la derecha, de frente). */
const KEY_LIGHT = new THREE.Vector3(2.5, 3.5, 4).normalize();

type Sampler = {
  /** Área de hilo a la vista, en unidades² de la pieza. */
  area: number;
  /** Escribe en `out` un punto al azar: posición (0–2), normal (3–5), sombra (6) y espiral (7). */
  pick: (random: () => number, out: Float32Array) => void;
};

const samplers = new WeakMap<THREE.BufferGeometry, Sampler>();

/** Copia plana de un atributo (los de las puntadas nunca son intercalados). */
const flat = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, fallback: number, count: number) => {
  if (!attribute) return new Float32Array(count).fill(fallback);
  const values = new Float32Array(count * attribute.itemSize);
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < attribute.itemSize; axis++) values[i * attribute.itemSize + axis] = attribute.getComponent(i, axis);
  }
  return values;
};

/**
 * Elige puntos al azar sobre la superficie de una pieza, repartidos por área. La cara
 * que queda contra el tejido (la de sombra horneada) no recibe fibras: no se vería.
 */
function getSampler(geometry: THREE.BufferGeometry): Sampler {
  const cached = samplers.get(geometry);
  if (cached) return cached;

  const vertices = geometry.getAttribute("position").count;
  const position = flat(geometry.getAttribute("position"), 0, vertices);
  const normal = flat(geometry.getAttribute("normal"), 0, vertices);
  const colorAttribute = geometry.getAttribute("color");
  // Solo el canal rojo de la sombra horneada (es gris).
  const shade = new Float32Array(vertices).map((_, i) => (colorAttribute ? colorAttribute.getX(i) : 1));
  const spiral = flat(geometry.getAttribute("spiral"), 0, vertices);
  const corners = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : Uint32Array.from({ length: vertices }, (_, i) => i);
  const triangles = corners.length / 3;

  const cumulative = new Float32Array(triangles);
  let area = 0;
  for (let t = 0; t < triangles; t++) {
    const i = corners[t * 3]! * 3;
    const j = corners[t * 3 + 1]! * 3;
    const k = corners[t * 3 + 2]! * 3;
    const abx = position[j]! - position[i]!;
    const aby = position[j + 1]! - position[i + 1]!;
    const abz = position[j + 2]! - position[i + 2]!;
    const acx = position[k]! - position[i]!;
    const acy = position[k + 1]! - position[i + 1]!;
    const acz = position[k + 2]! - position[i + 2]!;
    const cross = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    const triangleShade = (shade[i / 3]! + shade[j / 3]! + shade[k / 3]!) / 3;
    area += cross * 0.5 * THREE.MathUtils.smoothstep(triangleShade, 0.62, 0.8);
    cumulative[t] = area;
  }

  const sampler: Sampler = {
    area,
    pick(random, out) {
      const target = random() * area;
      let low = 0;
      let high = triangles - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (cumulative[middle]! < target) low = middle + 1;
        else high = middle;
      }
      const i = corners[low * 3]!;
      const j = corners[low * 3 + 1]!;
      const k = corners[low * 3 + 2]!;
      // Punto uniforme dentro del triángulo.
      const r = Math.sqrt(random());
      const s = random();
      const wi = 1 - r;
      const wj = r * (1 - s);
      const wk = r * s;
      for (let axis = 0; axis < 3; axis++) {
        out[axis] = position[i * 3 + axis]! * wi + position[j * 3 + axis]! * wj + position[k * 3 + axis]! * wk;
        out[3 + axis] = normal[i * 3 + axis]! * wi + normal[j * 3 + axis]! * wj + normal[k * 3 + axis]! * wk;
      }
      out[6] = shade[i]! * wi + shade[j]! * wj + shade[k]! * wk;
      out[7] = spiral[i]! * wi + spiral[j]! * wj + spiral[k]! * wk;
    },
  };
  samplers.set(geometry, sampler);
  return sampler;
}

const randomUnit = (random: () => number, out: THREE.Vector3) => {
  const z = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return out.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
};

/** El brillo de cada fibra se guarda en un byte (0–1): este es el máximo que cabe. */
const MAX_BRIGHTNESS = 1.25;
const VERTICES = SEGMENTS + 1;

/**
 * Fibras sueltas sobre todas las puntadas de `mesh`, en su mismo espacio. Normales y
 * datos van en bytes: con decenas de miles de fibras, la memoria se nota.
 */
function growFibers(mesh: THREE.InstancedMesh, style: FuzzStyle, random: () => number) {
  const sampler = getSampler(mesh.geometry);
  const matrix = new THREE.Matrix4();

  // Primero cuántas fibras lleva cada puntada (según su tamaño), para reservar memoria.
  const counts = new Uint16Array(mesh.count);
  let total = 0;
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix);
    const scale = matrix.getMaxScaleOnAxis();
    const expected = sampler.area * scale * scale * style.density * DENSITY_SCALE;
    counts[instance] = Math.floor(expected + random());
    total += counts[instance]!;
  }

  const positions = new Float32Array(total * VERTICES * 3);
  const normals = new Int8Array(total * VERTICES * 4);
  const data = new Uint8Array(total * VERTICES * 4);
  const indices = new Uint32Array(total * SEGMENTS * 2);

  const normalMatrix = new THREE.Matrix3();
  const root = new Float32Array(8);
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const wander = new THREE.Vector3();
  let fiber = 0;

  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix);
    normalMatrix.getNormalMatrix(matrix);
    const scale = matrix.getMaxScaleOnAxis();

    for (let n = 0; n < counts[instance]!; n++, fiber++) {
      sampler.pick(random, root);
      point.set(root[0]!, root[1]!, root[2]!).applyMatrix4(matrix);
      normal.set(root[3]!, root[4]!, root[5]!).applyMatrix3(normalMatrix).normalize();

      // Rumbo: una dirección cualquiera sobre la superficie, levantada un poco.
      randomUnit(random, tangent).addScaledVector(normal, -tangent.dot(normal)).normalize();
      const lift = (style.lift[0] + (style.lift[1] - style.lift[0]) * random()) * (Math.PI / 2);
      direction.copy(tangent).multiplyScalar(Math.cos(lift)).addScaledVector(normal, Math.sin(lift));
      // Casi todas cortas, alguna larga.
      const length = (style.length[0] + (style.length[1] - style.length[0]) * random() ** 1.8) * scale;
      const step = length / SEGMENTS;
      point.addScaledVector(normal, -ROOT_DEPTH * scale);

      // Mismo reparto que el shader: en qué hilo de la puntada bicolor nace la fibra.
      const band = Math.abs(root[7]! - Math.floor(root[7]!) - 0.5);
      const tone = band > 0.25 ? 255 : 0;
      // Fibras más claras y más oscuras (jaspeado), y menos luz en los huecos.
      const brightness = (0.78 + 0.44 * random()) * (0.55 + 0.45 * root[6]!);
      // Cuánto más clara que el hilo: así se distinguen sobre él, como en la lana real.
      const lightness = 0.3 + 0.7 * random();

      const nx = Math.round(normal.x * 127);
      const ny = Math.round(normal.y * 127);
      const nz = Math.round(normal.z * 127);
      const shine = Math.round((brightness / MAX_BRIGHTNESS) * 255);
      const light = Math.round(lightness * 255);
      const first = fiber * VERTICES;
      for (let k = 0; k < VERTICES; k++) {
        const vertex = first + k;
        positions[vertex * 3] = point.x;
        positions[vertex * 3 + 1] = point.y;
        positions[vertex * 3 + 2] = point.z;
        normals[vertex * 4] = nx;
        normals[vertex * 4 + 1] = ny;
        normals[vertex * 4 + 2] = nz;
        data[vertex * 4] = Math.round((k / SEGMENTS) * 255);
        data[vertex * 4 + 1] = tone;
        data[vertex * 4 + 2] = shine;
        data[vertex * 4 + 3] = light;
        if (k < SEGMENTS) {
          const segment = (fiber * SEGMENTS + k) * 2;
          indices[segment] = vertex;
          indices[segment + 1] = vertex + 1;
        }
        point.addScaledVector(direction, step);
        direction.addScaledVector(randomUnit(random, wander), style.curl).normalize();
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("hairNormal", new THREE.BufferAttribute(normals, 4, true));
  geometry.setAttribute("hairData", new THREE.BufferAttribute(data, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Las fibras son líneas de un píxel, sin iluminación propia: se sombrean con la normal
 * del hilo donde nacen y se pintan con el color de ese hilo, un poco más claro.
 */
function createFuzzMaterial(style: FuzzStyle, tones: YarnTones, press: PressUniforms | undefined) {
  const material = new THREE.LineBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tones, { uKeyLight: { value: KEY_LIGHT } });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 hairNormal;
        attribute vec4 hairData;
        uniform vec3 uKeyLight;
        varying vec4 vHairData;
        varying float vHairLight;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vHairData = hairData;
        vHairData.z *= ${MAX_BRIGHTNESS.toFixed(2)};
        vec3 hairViewNormal = normalize(normalMatrix * hairNormal.xyz);
        vHairLight = 0.62 + 0.55 * max(dot(hairViewNormal, uKeyLight), 0.0) + 0.12 * hairViewNormal.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uToneA;
        uniform vec3 uToneB;
        varying vec4 vHairData;
        varying float vHairLight;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Una fibra suelta deja pasar algo de luz: se ve más clara que el hilo, pero del
        // mismo color (la raíz cuadrada aclara sin volverla blanca en los hilos oscuros).
        vec3 hairTone = mix(uToneA, uToneB, vHairData.y);
        diffuseColor.rgb *= mix(hairTone, sqrt(hairTone), vHairData.w) * vHairLight * vHairData.z;
        // Se afina hacia la punta.
        diffuseColor.a *= 1.0 - 0.8 * vHairData.x * vHairData.x;`,
      );
    if (press) patchSoftPress(shader, press);
  };
  material.customProgramCacheKey = () => `fuzz:${press ? "press" : "rigid"}`;
  return material;
}

type FuzzOptions = {
  finish?: YarnFinish;
  /** Los colores del hilo (se comparten con su material, así cambian juntos)… */
  tones?: YarnTones;
  /** …o un color fijo, para los extras. */
  hex?: string;
  press?: PressUniforms;
  /** Semilla propia: sembrar pelusa no altera el resto del modelo. */
  seed: number;
};

/**
 * Pelusa que sobresale del hilo: fibras sueltas sobre las puntadas de cada pieza.
 * Va como hija de cada `InstancedMesh`, así que se mueve, se balancea y se hunde con él.
 */
export function createFuzz({ finish = "jersey", tones, hex = "#ffffff", press, seed }: FuzzOptions) {
  const style = STYLES[finish];
  const yarnTones = tones ?? createYarnTones();
  if (!tones) {
    yarnTones.uToneA.value.set(hex);
    yarnTones.uToneB.value.set(hex);
  }
  const material = createFuzzMaterial(style, yarnTones, press);
  const random = seededRandom(seed);
  const geometries: THREE.BufferGeometry[] = [];

  return {
    /** Le pone pelusa a `mesh` y lo devuelve, para usarlo en línea. */
    grow<T extends THREE.InstancedMesh>(mesh: T) {
      const geometry = growFibers(mesh, style, random);
      const lines = new THREE.LineSegments(geometry, material);
      // El hundimiento se hace en el shader; tampoco participa en el raycast.
      lines.frustumCulled = false;
      lines.raycast = () => {};
      mesh.add(lines);
      geometries.push(geometry);
      return mesh;
    },
    dispose() {
      material.dispose();
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
