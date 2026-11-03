import type { Yarn } from "../types/catalog";

/** Paleta de hilos. Para un color nuevo, agrégalo aquí y úsalo en `colorways.ts`. */
export const yarns = [
  { id: "cielo", name: "Cielo", hex: "#A9D3E8" },
  { id: "rosa-cuarzo", name: "Rosa Cuarzo", hex: "#EDB9C6" },
  { id: "lavanda", name: "Lavanda", hex: "#BFB0E3" },
  { id: "salvia", name: "Salvia", hex: "#A9C5A0" },
  { id: "crudo", name: "Crudo", hex: "#EFE6D4" },
  { id: "terracota", name: "Terracota", hex: "#C9745A" },
  { id: "marino", name: "Marino", hex: "#2F4468" },
  { id: "crema", name: "Crema", hex: "#E8D6C0" },
  { id: "cacao", name: "Cacao", hex: "#7A4A26" },
  { id: "vino", name: "Vino", hex: "#7A2638" },
  { id: "mostaza", name: "Mostaza", hex: "#D9A93A" },
  { id: "carbon", name: "Carbón", hex: "#2E2C31" },
] as const satisfies readonly Yarn[];

export type YarnId = (typeof yarns)[number]["id"];
