import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type LobeOptions = {
  /** Semilongitud (eje Y), semiancho (X) y semigrosor (Z). */
  length: number;
  width: number;
  thickness: number;
  /** Curvatura sobre la superficie y pliegues de la tira de tela. */
  bend?: number;
  pleats?: number;
  pleatDepth?: number;
  segments?: [number, number];
  /** Sombra horneada en la parte que queda contra el tejido. */
  ambientFloor?: number;
  /** Vueltas de la espiral que separa los dos hilos de una puntada bicolor. */
  stripeTurns?: number;
};

/** Volumen básico del hilo: un elipsoide pellizcado con pliegues a lo largo. */
export function createLobe({
  length,
  width,
  thickness,
  bend = 0,
  pleats = 5,
  pleatDepth = 0.07,
  segments = [10, 7],
  ambientFloor = 0.56,
  stripeTurns = 1.5,
}: LobeOptions) {
  const geometry = new THREE.SphereGeometry(1, segments[0], segments[1]);
  // La costura de la esfera queda en la cara de atrás, que no se ve.
  geometry.rotateY(-Math.PI / 2);

  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const tones = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const pleat = 1 + pleatDepth * Math.cos(angle * pleats + y * 2.2);
    const pinch = 1 - 0.18 * y * y;

    const finalZ = z * thickness * pleat * pinch - bend * length * y * y;
    position.setXYZ(i, x * width * pleat * pinch, y * length, finalZ);

    const crease = 0.5 + 0.5 * Math.cos(angle * pleats + y * 2.2);
    const facing = THREE.MathUtils.clamp((z + 0.35) / 1.1, 0, 1);
    const shade = THREE.MathUtils.lerp(ambientFloor, 1, facing) * (0.94 + 0.06 * crease);
    colors.set([shade, shade, shade], i * 3);

    // Dos hilos enrollados juntos: bandas en espiral a lo largo del lóbulo.
    const spiral = ((y + 1) / 2) * stripeTurns + angle / (Math.PI * 2);
    tones[i] = spiral - Math.floor(spiral) < 0.5 ? 0 : 1;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("tone", new THREE.BufferAttribute(tones, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function compose(lobes: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]) {
  const parts = lobes.map(({ geometry, matrix }) => geometry.applyMatrix4(matrix));
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("No se pudieron combinar las piezas de la puntada");
  return merged;
}

/** Punto bajo gordo: una "V" de dos lóbulos cerrada por una barra superior. */
export function createStitchGeometry() {
  const place = (x: number, y: number, z: number, rotationZ: number) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotationZ)),
      new THREE.Vector3(1, 1, 1),
    );
  const options = { length: 0.052, width: 0.03, thickness: 0.034, bend: 0.35 };
  return compose([
    { geometry: createLobe(options), matrix: place(-0.021, -0.008, 0.012, -0.52) },
    { geometry: createLobe(options), matrix: place(0.021, -0.008, 0.012, 0.52) },
    {
      geometry: createLobe({ length: 0.05, width: 0.021, thickness: 0.026, bend: 0.45, pleats: 4 }),
      matrix: place(0, 0.03, 0.016, Math.PI / 2),
    },
  ]);
}

const scratch = {
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  basis: new THREE.Matrix4(),
};

/** Coloca un lóbulo: `along` es su eje largo y `out` hacia dónde mira. */
export function placeLobe(
  position: THREE.Vector3,
  along: THREE.Vector3,
  out: THREE.Vector3,
  scale: number | THREE.Vector3 = 1,
) {
  const { x, y, z } = scratch;
  z.copy(out).normalize();
  y.copy(along).addScaledVector(z, -along.dot(z)).normalize();
  x.crossVectors(y, z).normalize();
  scratch.basis.makeBasis(x, y, z);
  scratch.quaternion.setFromRotationMatrix(scratch.basis);
  if (typeof scale === "number") scratch.scale.setScalar(scale);
  else scratch.scale.copy(scale);
  return new THREE.Matrix4().compose(position, scratch.quaternion, scratch.scale);
}

type RopeOptions = {
  radius: number;
  step: number;
  strands?: number;
  turn?: number;
  tilt?: number;
  random?: () => number;
};

/** Trenza: hebras que giran alrededor de una curva, una instancia por tramo. */
export function placeRope(
  curve: THREE.Curve<THREE.Vector3>,
  { radius, step, strands = 3, turn = 0.95, tilt = 0.62, random = Math.random }: RopeOptions,
) {
  const matrices: THREE.Matrix4[] = [];
  const count = Math.round(curve.getLength() / step);
  const reference = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3().crossVectors(tangent, reference).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    for (let strand = 0; strand < strands; strand++) {
      const phase = (strand * Math.PI * 2) / strands + i * turn;
      const out = normal.clone().multiplyScalar(Math.cos(phase)).addScaledVector(binormal, Math.sin(phase));
      const around = normal.clone().multiplyScalar(-Math.sin(phase)).addScaledVector(binormal, Math.cos(phase));
      const along = tangent.clone().addScaledVector(around, Math.tan(tilt));
      const position = center.clone().addScaledVector(out, radius);
      matrices.push(placeLobe(position, along, out, 0.92 + random() * 0.2));
    }
  }
  return matrices;
}

/** Crea el `InstancedMesh` listo para usar. No participa en el raycast: usa proxies. */
export function createInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  random: () => number,
  toneVariation = 0.07,
) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  const tone = new THREE.Color();
  matrices.forEach((matrix, index) => {
    mesh.setMatrixAt(index, matrix);
    tone.setScalar(1 - random() * toneVariation);
    mesh.setColorAt(index, tone);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // El hundimiento se hace en el shader; el volumen de culling de Three no lo conoce.
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * Separa una geometría en los triángulos de cada hilo (atributo `tone`), para
 * pintar cada parte con su propio material sin shaders especiales.
 */
export function splitByTone(geometry: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const tone = flat.getAttribute("tone");
  const names = Object.keys(flat.attributes).filter((name) => name !== "tone");
  const buckets: Record<string, number[]>[] = [{}, {}];
  for (const bucket of buckets) for (const name of names) bucket[name] = [];

  for (let vertex = 0; vertex < tone.count; vertex += 3) {
    const average = (tone.getX(vertex) + tone.getX(vertex + 1) + tone.getX(vertex + 2)) / 3;
    const bucket = buckets[average >= 0.5 ? 1 : 0]!;
    for (const name of names) {
      const attribute = flat.getAttribute(name);
      for (let k = 0; k < 3; k++) {
        for (let c = 0; c < attribute.itemSize; c++) {
          bucket[name]!.push(attribute.getComponent(vertex + k, c));
        }
      }
    }
  }
  flat.dispose();

  return buckets.map((bucket) => {
    const part = new THREE.BufferGeometry();
    for (const name of names) {
      const itemSize = geometry.getAttribute(name).itemSize;
      part.setAttribute(name, new THREE.Float32BufferAttribute(bucket[name]!, itemSize));
    }
    return part;
  }) as [THREE.BufferGeometry, THREE.BufferGeometry];
}

/**
 * Las dos partes de un hilo bicolor comparten matrices y variación de tono, así
 * que se ven como una sola puntada. En los bolsos de un color ambas usan el mismo tono.
 */
export function createInstancedPair(
  [geometryA, geometryB]: [THREE.BufferGeometry, THREE.BufferGeometry],
  [materialA, materialB]: [THREE.Material, THREE.Material],
  matrices: THREE.Matrix4[],
  random: () => number,
) {
  const seed = Math.floor(random() * 1e9);
  const group = new THREE.Group();
  group.add(createInstanced(geometryA, materialA, matrices, seededLike(seed)));
  group.add(createInstanced(geometryB, materialB, matrices, seededLike(seed)));
  return group;
}

function seededLike(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type TubeStitchOptions = {
  radius: number;
  rowSpacing: number;
  perRow: number;
  scale: number;
  random: () => number;
};

/** Asa tejida como tubo: anillos de puntadas a lo largo de la curva. */
export function placeTubeStitches(
  curve: THREE.Curve<THREE.Vector3>,
  { radius, rowSpacing, perRow, scale, random }: TubeStitchOptions,
) {
  const matrices: THREE.Matrix4[] = [];
  const rows = Math.round(curve.getLength() / rowSpacing);
  const reference = new THREE.Vector3(0, 0, 1);

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3().crossVectors(tangent, reference).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    for (let k = 0; k < perRow; k++) {
      const phase = ((k + (row % 2) * 0.5) / perRow) * Math.PI * 2 + (random() - 0.5) * 0.12;
      const out = normal.clone().multiplyScalar(Math.cos(phase)).addScaledVector(binormal, Math.sin(phase));
      const around = normal.clone().multiplyScalar(-Math.sin(phase)).addScaledVector(binormal, Math.cos(phase));
      const along = tangent.clone().addScaledVector(around, 0.3);
      const position = center.clone().addScaledVector(out, radius);
      matrices.push(placeLobe(position, along, out, scale * (0.96 + random() * 0.1)));
    }
  }
  return matrices;
}
