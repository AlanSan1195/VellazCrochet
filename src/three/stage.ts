import { createContext, useContext } from "react";
import * as THREE from "three";
import { createPressUniforms, type PressUniforms } from "./lib/softPress";

export type Stage = {
  press: PressUniforms;
  spin: {
    /** Rotación que da el usuario al arrastrar. */
    quaternion: THREE.Quaternion;
    /** Rotación total en pantalla (usuario + animación de scroll). */
    world: THREE.Quaternion;
    /** Velocidad angular total, en coordenadas del mundo. */
    omega: THREE.Vector3;
  };
};

export function createStage(initial: THREE.Quaternion): Stage {
  return {
    press: createPressUniforms(),
    spin: { quaternion: initial.clone(), world: initial.clone(), omega: new THREE.Vector3() },
  };
}

export const StageContext = createContext<Stage | null>(null);

export function useStage() {
  const stage = useContext(StageContext);
  if (!stage) throw new Error("useStage debe usarse dentro de BagView");
  return stage;
}
