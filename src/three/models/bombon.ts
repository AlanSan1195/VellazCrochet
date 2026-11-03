import { createArchCurve, createBodyShape } from "../lib/bodyShape";
import type { BagBlueprint } from "./KnitBag";

/**
 * Bombón: proporciones medidas en Sujeto_2.png. Cuerpo trapezoidal muy abombado,
 * base ancha (1.3 del alto), boca estrecha y una sola asa gruesa en el plano frontal.
 */
const shape = createBodyShape({
  halfWidth: 0.65,
  halfDepth: 0.3,
  exponent: 2.4,
  profile: [
    [0, 0, -0.5],
    [0.5, 0.5, -0.51],
    [0.82, 0.82, -0.48],
    [0.97, 0.96, -0.38],
    [1, 1, -0.22],
    [0.96, 0.95, 0],
    [0.87, 0.86, 0.2],
    [0.77, 0.75, 0.36],
    [0.7, 0.64, 0.46],
    [0.67, 0.5, 0.52],
    [0.64, 0.3, 0.54],
  ],
});

export const bombon: BagBlueprint = {
  shape,
  finish: "satin",
  seed: 29,
  body: { rowSpacing: 0.12, stitchSpacing: 0.13, rowShift: 0.5, stitchScale: 1.5, lean: 0.38 },
  handles: [
    {
      kind: "tube",
      curve: createArchCurve([
        [-0.36, 0.4],
        [-0.37, 0.7],
        [-0.3, 0.95],
        [-0.15, 1.08],
        [0, 1.1],
        [0.15, 1.08],
        [0.3, 0.95],
        [0.37, 0.7],
        [0.36, 0.4],
      ]),
      radius: 0.12,
      rowSpacing: 0.09,
      perRow: 7,
      stitchScale: 1.3,
    },
  ],
};
