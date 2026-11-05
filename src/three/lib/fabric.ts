import * as THREE from "three";
import { patchSoftPress, type PressUniforms, type ShaderSource } from "./softPress";
import { getYarnTextures } from "./yarnTexture";

/** `jersey`: trapillo de camiseta, mate. `satin`: cinta brillante, como el modelo Bombón. */
export type YarnFinish = "jersey" | "satin";

/** Los dos hilos de una puntada. En los bolsos de un color, ambos son el mismo. */
export type YarnTones = { uToneA: { value: THREE.Color }; uToneB: { value: THREE.Color } };

export function createYarnTones(): YarnTones {
  return { uToneA: { value: new THREE.Color("#ffffff") }, uToneB: { value: new THREE.Color("#ffffff") } };
}

type FabricOptions = {
  hex: string;
  finish?: YarnFinish;
  press?: PressUniforms;
  /**
   * Pinta las bandas de los dos hilos por píxel a partir del atributo `spiral` de la
   * geometría: bordes limpios y una sola malla por pieza.
   */
  tones?: YarnTones;
  /** Las geometrías de puntada traen sombra horneada en color de vértice. */
  vertexColors?: boolean;
  side?: THREE.Side;
};

const FINISHES: Record<YarnFinish, THREE.MeshPhysicalMaterialParameters> = {
  // Algodón: mate, con un brillo aterciopelado en los bordes que da la pelusa.
  jersey: {
    roughness: 1,
    normalScale: new THREE.Vector2(0.85, 0.85),
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.32),
  },
  // Cinta: brillo alargado a lo largo de las fibras, como el satén.
  satin: {
    roughness: 1,
    normalScale: new THREE.Vector2(0.55, 0.55),
    sheen: 0.45,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.3),
    specularIntensity: 0.8,
    anisotropy: 0.55,
    anisotropyRotation: Math.PI / 2,
  },
};

/**
 * Cada puntada usa un trozo distinto de la textura (según su posición), para que el
 * tejido no se vea repetido. Si hay dos hilos, también los pinta en espiral.
 */
function patchYarn(shader: ShaderSource, tones: YarnTones | undefined) {
  const jitter = (name: string, define: string) => `
    #ifdef ${define}
      ${name} += yarnJitter;
    #endif`;

  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
      ${tones ? "attribute float spiral;\nvarying float vYarnSpiral;" : ""}`,
    )
    .replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 yarnJitter = fract(instanceMatrix[3].xy * vec2(17.13, 23.71) + instanceMatrix[3].zx * vec2(9.37, 5.53));
        ${jitter("vMapUv", "USE_MAP")}
        ${jitter("vNormalMapUv", "USE_NORMALMAP")}
        ${jitter("vRoughnessMapUv", "USE_ROUGHNESSMAP")}
      #endif
      ${tones ? "vYarnSpiral = spiral;" : ""}`,
    );

  if (!tones) return;
  Object.assign(shader.uniforms, tones);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      uniform vec3 uToneA;
      uniform vec3 uToneB;
      varying float vYarnSpiral;`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      // Distancia al centro de cada banda: los dos hilos ocupan mitades iguales.
      float yarnBand = abs(fract(vYarnSpiral) - 0.5);
      float yarnWidth = max(fwidth(vYarnSpiral), 1e-4) * 1.2;
      diffuseColor.rgb *= mix(uToneA, uToneB, smoothstep(0.25 - yarnWidth, 0.25 + yarnWidth, yarnBand));
      // Donde un hilo monta sobre el otro queda una línea de sombra (solo si son distintos).
      float yarnContrast = clamp(length(uToneA - uToneB) * 3.0, 0.0, 1.0);
      diffuseColor.rgb *= 1.0 - 0.16 * yarnContrast * exp(-pow((yarnBand - 0.25) / 0.04, 2.0));`,
    );
}

export function createFabricMaterial({
  hex,
  finish = "jersey",
  press,
  tones,
  vertexColors = true,
  side,
}: FabricOptions) {
  const { albedo, normal, roughness } = getYarnTextures(finish);
  const material = new THREE.MeshPhysicalMaterial({
    color: hex,
    map: albedo,
    normalMap: normal,
    roughnessMap: roughness,
    metalness: 0,
    vertexColors,
    side: side ?? THREE.FrontSide,
    ...FINISHES[finish],
  });

  material.onBeforeCompile = (shader) => {
    patchYarn(shader, tones);
    if (press) patchSoftPress(shader, press);
  };
  material.customProgramCacheKey = () => `yarn:${tones ? "tones" : "solid"}:${press ? "press" : "rigid"}`;
  return material;
}
