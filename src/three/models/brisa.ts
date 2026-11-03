import { createArchCurve, createBodyShape } from "../lib/bodyShape";
import type { BagBlueprint } from "./KnitBag";

/** Brisa: proporciones medidas en Sujeto.png, con el alto del cuerpo = 1. */
const shape = createBodyShape({
  halfWidth: 0.69,
  halfDepth: 0.24,
  exponent: 2.8,
  profile: [
    [0, 0, -0.5],
    [0.45, 0.45, -0.51],
    [0.78, 0.78, -0.49],
    [0.95, 0.95, -0.41],
    [1, 1, -0.27],
    [0.985, 0.98, -0.1],
    [0.93, 0.92, 0.1],
    [0.85, 0.82, 0.3],
    [0.8, 0.7, 0.43],
    [0.785, 0.52, 0.5],
    [0.78, 0.28, 0.525],
    [0.76, 0.08, 0.52],
  ],
});

const archPoints: [number, number][] = [
  [-0.46, 0.44],
  [-0.43, 0.6],
  [-0.34, 0.92],
  [-0.2, 1.24],
  [-0.07, 1.39],
  [0.07, 1.39],
  [0.2, 1.24],
  [0.34, 0.92],
  [0.43, 0.6],
  [0.46, 0.44],
];

/** Dos asas, al frente y atrás; se juntan un poco en la parte alta. */
const handle = (side: 1 | -1) =>
  createArchCurve(archPoints, (height) => side * (0.09 - 0.028 * height));

export const brisa: BagBlueprint = {
  shape,
  finish: "jersey",
  seed: 11,
  body: { rowSpacing: 0.082, stitchSpacing: 0.086, rowShift: 0.42, stitchScale: 1, lean: 0.3 },
  handles: [
    { kind: "braid", curve: handle(1), radius: 0.058, step: 0.052 },
    { kind: "braid", curve: handle(-1), radius: 0.058, step: 0.052 },
  ],
};
