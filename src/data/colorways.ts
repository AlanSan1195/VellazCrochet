import type { Colorway } from "../types/catalog";
import { yarns, type YarnId } from "./yarns";

const hexOf = (id: YarnId) => yarns.find((yarn) => yarn.id === id)!.hex;

/** Cada hilo de la paleta también existe como color liso. */
const solids: Colorway[] = yarns.map((yarn) => ({ id: yarn.id, name: yarn.name, tones: [yarn.hex] }));

/** Combinaciones bicolor: dos hilos tejidos juntos en cada puntada. */
const duos: { id: string; name: string; yarns: [YarnId, YarnId] }[] = [
  { id: "cafe-con-leche", name: "Café con leche", yarns: ["crema", "cacao"] },
  { id: "marinero", name: "Marinero", yarns: ["crudo", "marino"] },
  { id: "frambuesa", name: "Frambuesa", yarns: ["rosa-cuarzo", "vino"] },
  { id: "hierbabuena", name: "Hierbabuena", yarns: ["crudo", "salvia"] },
  { id: "miel", name: "Miel", yarns: ["crudo", "mostaza"] },
  { id: "canela", name: "Canela", yarns: ["crema", "terracota"] },
  { id: "domino", name: "Dominó", yarns: ["crudo", "carbon"] },
];

export const colorways: Colorway[] = [
  ...solids,
  ...duos.map(({ id, name, yarns: [a, b] }) => ({ id, name, tones: [hexOf(a), hexOf(b)] as [string, string] })),
];

export function getColorways(ids: string[]) {
  return ids.map((id) => {
    const colorway = colorways.find((item) => item.id === id);
    if (!colorway) throw new Error(`Combinación desconocida: ${id}`);
    return colorway;
  });
}
