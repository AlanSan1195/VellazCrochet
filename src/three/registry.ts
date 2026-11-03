import type { ComponentType } from "react";
import type { BagExtra } from "../types/catalog";
import { FlowerCharm } from "./extras/FlowerCharm";
import { OrnamentCharm } from "./extras/OrnamentCharm";
import type { BodyCollider } from "./lib/pendulum";
import { bombon } from "./models/bombon";
import { brisa } from "./models/brisa";
import type { BagBlueprint } from "./models/KnitBag";

export type ExtraModelProps = { extra: BagExtra; collider: BodyCollider };

export type BagDefinition = {
  blueprint: BagBlueprint;
  /** Altura del centro visual, para que el modelo gire centrado. */
  centerY: number;
};

/** Para un bolso nuevo: crea su receta en `models/` y regístrala aquí. */
export const bagRegistry: Record<string, BagDefinition> = {
  brisa: { blueprint: brisa, centerY: 0.46 },
  bombon: { blueprint: bombon, centerY: 0.3 },
};

export const extraRegistry: Record<string, ComponentType<ExtraModelProps>> = {
  "flower-charm": FlowerCharm,
  ornament: OrnamentCharm,
};
