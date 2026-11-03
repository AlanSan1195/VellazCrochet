export type Vec3 = [x: number, y: number, z: number];

/** Un hilo de la paleta. Las combinaciones lo referencian por `id`. */
export type Yarn = {
  id: string;
  name: string;
  hex: string;
};

/**
 * Cómo se pinta un bolso: un hilo (liso) o dos hilos tejidos juntos (bicolor).
 * `tones` guarda los colores ya resueltos desde la paleta.
 */
export type Colorway = {
  id: string;
  name: string;
  tones: [string] | [string, string];
};

export type BagExtra = {
  id: string;
  name: string;
  /** Clave en `extraRegistry` (src/three/registry.ts). */
  modelKey: string;
  /** Punto del bolso donde se sujeta el extra, en coordenadas del modelo. */
  anchor: Vec3;
  /** Los extras tienen color propio: no los pinta el selector del bolso. */
  hex: string;
  defaultVisible: boolean;
};

export type BagProduct = {
  id: string;
  name: string;
  /** Frase corta bajo el nombre. */
  tagline: string;
  description: string;
  /** Clave en `bagRegistry` (src/three/registry.ts). */
  modelKey: string;
  /** El primero es el de la foto original. */
  colorwayIds: string[];
  extras: BagExtra[];
};
