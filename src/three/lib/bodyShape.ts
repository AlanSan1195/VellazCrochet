import * as THREE from "three";
import type { BodyCollider } from "./pendulum";

/** Sección del cuerpo desde el centro de la base hasta la boca: [ancho, fondo, alto]. */
export type ProfilePoint = readonly [sx: number, sz: number, y: number];

export type BodyShapeConfig = {
  /** Medidas con el alto del cuerpo = 1. */
  halfWidth: number;
  halfDepth: number;
  /** Superelipse del contorno: 2 es óvalo; valores mayores, más cuadrado. */
  exponent: number;
  profile: readonly ProfilePoint[];
};

const signedPower = (value: number, power: number) => Math.sign(value) * Math.abs(value) ** power;

export type BodyShape = ReturnType<typeof createBodyShape>;

/** Todo lo que un modelo necesita de su silueta: superficie, mallas y colisión. */
export function createBodyShape({ halfWidth, halfDepth, exponent, profile }: BodyShapeConfig) {
  const power = 2 / exponent;
  const profileCurve = new THREE.CatmullRomCurve3(
    profile.map(([sx, sz, y]) => new THREE.Vector3(sx, sz, y)),
    false,
    "centripetal",
  );
  const top = profile[profile.length - 1]![2];

  /** `u` recorre el perfil (0 base, 1 boca) y `angle` el contorno. */
  function surfacePoint(u: number, angle: number, target = new THREE.Vector3(), inset = 1) {
    const point = profileCurve.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
    return target.set(
      halfWidth * point.x * signedPower(Math.cos(angle), power) * inset,
      point.z * inset,
      halfDepth * point.y * signedPower(Math.sin(angle), power) * inset,
    );
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();

  function surfaceFrame(u: number, angle: number) {
    const h = 0.004;
    surfacePoint(Math.max(u - h, 0.001), angle, a);
    surfacePoint(Math.min(u + h, 1), angle, b);
    surfacePoint(u, angle - h, c);
    surfacePoint(u, angle + h, d);
    const up = b.clone().sub(a).normalize();
    const around = d.clone().sub(c).normalize();
    const normal = new THREE.Vector3().crossVectors(around, up).normalize();
    const point = surfacePoint(u, angle);
    if (normal.dot(point) < 0) normal.negate();
    return { point, up, around, normal };
  }

  /** Longitud física de un meridiano, para repartir las hileras de forma pareja. */
  function buildMeridianTable(samples = 240) {
    const lengths = [0];
    const previous = surfacePoint(0, Math.PI / 5);
    const current = new THREE.Vector3();
    for (let i = 1; i <= samples; i++) {
      surfacePoint(i / samples, Math.PI / 5, current);
      lengths.push(lengths[i - 1]! + current.distanceTo(previous));
      previous.copy(current);
    }
    const total = lengths[samples]!;
    const uAtLength = (length: number) => {
      const index = lengths.findIndex((value) => value >= length);
      return index < 0 ? 1 : index / samples;
    };
    return { total, uAtLength };
  }

  /** Longitud acumulada del contorno en la altura `u`, para repartir puntadas. */
  function buildRingTable(u: number, samples = 240) {
    const lengths = [0];
    const previous = surfacePoint(u, 0);
    const current = new THREE.Vector3();
    for (let i = 1; i <= samples; i++) {
      surfacePoint(u, (i / samples) * Math.PI * 2, current);
      lengths.push(lengths[i - 1]! + current.distanceTo(previous));
      previous.copy(current);
    }
    const total = lengths[samples]!;
    const angleAtLength = (length: number) => {
      const wrapped = ((length % total) + total) % total;
      const index = lengths.findIndex((value) => value >= wrapped);
      return (Math.max(index, 0) / samples) * Math.PI * 2;
    };
    return { total, angleAtLength };
  }

  /** Malla interior oscura: se ve por los huecos del tejido y recibe los toques. */
  function createShellGeometry(rings = 56, segments = 72) {
    const inset = 0.975;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const point = new THREE.Vector3();

    for (let ring = 0; ring <= rings; ring++) {
      const u = ring / rings;
      for (let segment = 0; segment <= segments; segment++) {
        surfacePoint(u, (segment / segments) * Math.PI * 2, point, inset);
        positions.push(point.x, point.y, point.z);
        uvs.push((segment / segments) * 24, u * 12);
      }
    }
    const row = segments + 1;
    for (let ring = 0; ring < rings; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const i = ring * row + segment;
        indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
      }
    }
    // Tapa la boca: el interior es oscuro, no hueco.
    const center = positions.length / 3;
    positions.push(0, top * inset, 0);
    uvs.push(0, 0);
    const last = rings * row;
    for (let segment = 0; segment < segments; segment++) {
      indices.push(last + segment, center, last + segment + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Cuerpo simplificado por alturas: basta para que los colgantes no lo atraviesen. */
  const collider: BodyCollider = (point, padding) => {
    if (point.y < profile[0]![2] - 0.05 || point.y > top + 0.04) return null;
    let sx = 1;
    let sz = 1;
    for (let i = 3; i < profile.length - 1; i++) {
      const lower = profile[i]!;
      const upper = profile[i + 1]!;
      if (point.y >= lower[2] && point.y <= upper[2]) {
        const t = (point.y - lower[2]) / (upper[2] - lower[2]);
        sx = THREE.MathUtils.lerp(lower[0], upper[0], t);
        sz = THREE.MathUtils.lerp(lower[1], upper[1], t);
        break;
      }
    }
    const width = halfWidth * sx + padding;
    const depth = halfDepth * sz + padding;
    const k = Math.abs(point.x / width) ** exponent + Math.abs(point.z / depth) ** exponent;
    if (k >= 1) return null;

    if (k < 1e-4) {
      point.z = depth * (point.z < 0 ? -1 : 1);
    } else {
      const scale = k ** (-1 / exponent);
      point.x *= scale;
      point.z *= scale;
    }
    return new THREE.Vector3(point.x / (width * width), 0, point.z / (depth * depth)).normalize();
  };

  return { surfacePoint, surfaceFrame, buildMeridianTable, buildRingTable, createShellGeometry, collider };
}

/** Curva que pasa por puntos [x, y] del plano frontal, con un fondo `z(alto)` opcional. */
export function createArchCurve(points: [number, number][], z: (heightRatio: number) => number = () => 0) {
  const ys = points.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, z((y - minY) / (maxY - minY)))),
    false,
    "centripetal",
  );
}
