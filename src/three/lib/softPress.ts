import * as THREE from "three";

export type PressUniforms = {
  uPressPoint: { value: THREE.Vector3 };
  uPressDir: { value: THREE.Vector3 };
  uPressDepth: { value: number };
  uPressRadius: { value: number };
};

/** Programa de un material justo antes de compilarse (lo que recibe `onBeforeCompile`). */
export type ShaderSource = Parameters<THREE.Material["onBeforeCompile"]>[0];

export function createPressUniforms(): PressUniforms {
  return {
    uPressPoint: { value: new THREE.Vector3() },
    uPressDir: { value: new THREE.Vector3(0, 0, -1) },
    uPressDepth: { value: 0 },
    uPressRadius: { value: 0.26 },
  };
}

/**
 * Hundimiento de tela en el vertex shader: mueve a la vez todas las puntadas
 * instanciadas sin recalcular geometría. Un borde leve se levanta alrededor,
 * como el relleno que se desplaza al apretar, y la normal se inclina para que
 * la luz delate la forma.
 */
export function patchSoftPress(shader: ShaderSource, uniforms: PressUniforms) {
  {
    Object.assign(shader.uniforms, uniforms);
    // De frente un hundimiento casi no cambia la silueta: la sombra es lo que lo revela.
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPressShade;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - vPressShade;",
      );
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uPressPoint;
        uniform vec3 uPressDir;
        uniform float uPressDepth;
        uniform float uPressRadius;
        varying float vPressShade;
        float softPressFalloff(vec3 p) {
          vec3 offset = p - uPressPoint;
          float d2 = dot(offset, offset);
          float r2 = uPressRadius * uPressRadius;
          return exp(-d2 / r2) - 0.2 * exp(-d2 / (r2 * 3.2));
        }`,
      )
      .replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
        vec3 pressLocal = position;
        #ifdef USE_INSTANCING
          pressLocal = (instanceMatrix * vec4(position, 1.0)).xyz;
        #endif
        vec3 pressOffset = (pressLocal - uPressPoint) / uPressRadius;
        float pressFade = exp(-dot(pressOffset, pressOffset));
        vPressShade = clamp(pressFade * uPressDepth * 3.2, 0.0, 0.5);
        transformedNormal = normalize(transformedNormal)
          - normalMatrix * pressOffset * pressFade * uPressDepth * 7.0;`,
      )
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition.xyz += uPressDir * uPressDepth * softPressFalloff(mvPosition.xyz);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  }
}
