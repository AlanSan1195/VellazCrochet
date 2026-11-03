import type { BagProduct } from "../types/catalog";

/** Catálogo: cada bolso es una sección de la landing, en este orden. */
export const bags: BagProduct[] = [
  {
    id: "brisa",
    name: "Brisa",
    tagline: "Hobo de trapillo con asas trenzadas",
    description:
      "Puntadas gordas en diagonal, dos asas trenzadas a mano y una flor que cuelga del asa. Ligera y suave como tela de camiseta.",
    modelKey: "brisa",
    colorwayIds: ["cielo", "rosa-cuarzo", "lavanda", "salvia", "crudo", "terracota", "marino"],
    extras: [
      {
        id: "flor-amarilla",
        name: "Flor amarilla",
        modelKey: "flower-charm",
        anchor: [-0.43, 0.57, 0.18],
        hex: "#F3DF8A",
        defaultVisible: true,
      },
    ],
  },
  {
    id: "bombon",
    name: "Bombón",
    tagline: "Mini bolso bicolor de cinta",
    description:
      "Dos hilos de cinta satinada tejidos juntos en cada puntada. Pequeño, firme y con un asa gruesa que nace del cuerpo.",
    modelKey: "bombon",
    colorwayIds: ["cafe-con-leche", "marinero", "frambuesa", "hierbabuena", "miel", "canela", "domino"],
    extras: [
      {
        id: "esfera-navidena",
        name: "Esfera navideña",
        modelKey: "ornament",
        anchor: [0.37, 0.64, 0.15],
        hex: "#C8102E",
        defaultVisible: true,
      },
    ],
  },
];
