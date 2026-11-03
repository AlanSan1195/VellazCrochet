import * as THREE from "three";
import { applySoftPress, type PressUniforms } from "./softPress";
import { getYarnTextures } from "./yarnTexture";

/** `jersey`: trapillo de camiseta, mate. `satin`: cinta brillante, como el modelo Bombón. */
export type YarnFinish = "jersey" | "satin";

type FabricOptions = {
  hex: string;
  finish?: YarnFinish;
  press?: PressUniforms;
  /** Las geometrías de puntada traen sombra horneada en color de vértice. */
  vertexColors?: boolean;
  side?: THREE.Side;
};

const FINISHES: Record<YarnFinish, THREE.MeshPhysicalMaterialParameters> = {
  jersey: {
    roughness: 0.86,
    bumpScale: 0.45,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.28),
  },
  satin: {
    roughness: 0.4,
    bumpScale: 0.3,
    sheen: 0.5,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.35),
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
  },
};

export function createFabricMaterial({
  hex,
  finish = "jersey",
  press,
  vertexColors = true,
  side,
}: FabricOptions) {
  const { albedo, bump } = getYarnTextures();
  const material = new THREE.MeshPhysicalMaterial({
    color: hex,
    map: albedo,
    bumpMap: bump,
    metalness: 0,
    vertexColors,
    side: side ?? THREE.FrontSide,
    ...FINISHES[finish],
  });
  if (press) applySoftPress(material, press);
  return material;
}
