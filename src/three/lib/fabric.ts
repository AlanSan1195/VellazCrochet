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
  // Algodón: difuso de tela (EON) y casi sin reflejo; la pelusa da un halo aterciopelado
  // del color del hilo hacia los bordes, en vez del brillo blanco de un plástico.
  jersey: {
    roughness: 1,
    diffuseRoughness: 0.8,
    specularIntensity: 0.25,
    normalScale: new THREE.Vector2(0.85, 0.85),
    sheen: 1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.85),
  },
  // Cinta: un brillo suave alargado a lo largo de las fibras, sin llegar a plástico.
  satin: {
    roughness: 1,
    diffuseRoughness: 0.35,
    specularIntensity: 0.45,
    normalScale: new THREE.Vector2(0.55, 0.55),
    sheen: 0.6,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color("#ffffff").multiplyScalar(0.6),
    anisotropy: 0.4,
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
        // Solo alrededor de la hebra: a lo largo, la textura debe coincidir con las puntas.
        vec2 yarnJitter = vec2(fract(dot(instanceMatrix[3].xyz, vec3(17.13, 23.71, 9.37))), 0.0);
        ${jitter("vMapUv", "USE_MAP")}
        ${jitter("vNormalMapUv", "USE_NORMALMAP")}
        ${jitter("vRoughnessMapUv", "USE_ROUGHNESSMAP")}
      #endif
      ${tones ? "vYarnSpiral = spiral;" : ""}`,
    );

  // La pelusa dispersa la luz con el color de la fibra (no en blanco) y solo donde hay
  // fibras: canal azul de la rugosidad. Hacia el borde la textura se ve oblicua y el
  // mipmap borraría las fibras; el sesgo las mantiene, para que el halo se vea fibroso.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_physical_fragment>",
    `#include <lights_physical_fragment>
    #ifdef USE_SHEEN
      float yarnFuzz = 1.0;
      #ifdef USE_ROUGHNESSMAP
        yarnFuzz = texture(roughnessMap, vRoughnessMapUv, -1.0).b;
      #endif
      // En hilos muy oscuros la fibra igual se ve un poco gris: el tinte tiene un mínimo.
      material.sheenColor *= (0.25 + 0.75 * sqrt(max(diffuseColor.rgb, vec3(0.0)))) * yarnFuzz;
    #endif`,
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
