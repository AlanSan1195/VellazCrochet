import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { createBodyShape } from "../lib/bodyShape";
import { createFabricMaterial } from "../lib/fabric";
import { createFuzz } from "../lib/fuzz";
import { seededRandom } from "../lib/random";
import { createInstanced, createStitchGeometry, placeBodyStitches } from "../lib/stitches";
import type { ExtraModelProps } from "../registry";
import { HangingCharm } from "./HangingCharm";

/** Radio del relleno; las puntadas sobresalen un poco por encima. */
const RADIUS = 0.125;
const KNIT_RADIUS = RADIUS + 0.026;
const CORD_LENGTH = 0.2;
const CAP_HEIGHT = 0.045;
const ROD_LENGTH = CORD_LENGTH + CAP_HEIGHT + KNIT_RADIUS;
const GOLD = "#D4AF5A";

/** Una esfera como "cuerpo" tejido: se le aplican las mismas hileras que a los bolsos. */
const sphere = createBodyShape({
  halfWidth: RADIUS,
  halfDepth: RADIUS,
  exponent: 2,
  profile: Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * Math.PI;
    return [Math.sin(angle), Math.sin(angle), -RADIUS * Math.cos(angle)] as const;
  }),
});

/** Mismo punto bajo que Bombón, a escala de adorno. */
const STITCHES = {
  rowSpacing: 0.06,
  stitchSpacing: 0.064,
  rowShift: 0.5,
  stitchScale: 0.74,
  lean: 0.38,
  thickness: 0.65,
};

/** Esfera navideña tejida en cinta satinada, con tapa dorada y un cordón dorado. */
export function OrnamentCharm(props: ExtraModelProps) {
  const { hex } = props.extra;

  const ornament = useMemo(() => {
    const random = seededRandom(53);
    const group = new THREE.Group();
    const centerY = -ROD_LENGTH;

    const yarn = createFabricMaterial({ hex, finish: "satin" });
    const filling = createFabricMaterial({ hex, finish: "satin", vertexColors: false });
    filling.color.multiplyScalar(0.4);
    const fuzz = createFuzz({ hex, finish: "satin", seed: 59 });

    const stitchGeometry = createStitchGeometry();
    const stitches = fuzz.grow(createInstanced(stitchGeometry, yarn, placeBodyStitches(sphere, STITCHES, random), random));
    stitches.position.y = centerY;

    const fillingGeometry = new THREE.SphereGeometry(RADIUS * 0.97, 32, 20);
    const core = new THREE.Mesh(fillingGeometry, filling);
    core.position.y = centerY;

    // Tapa dorada con estrías y la argolla de la que sale el cordón.
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.3 });
    const capGeometry = new THREE.CylinderGeometry(0.04, 0.052, CAP_HEIGHT, 24, 1);
    const capPosition = capGeometry.getAttribute("position");
    for (let i = 0; i < capPosition.count; i++) {
      const angle = Math.atan2(capPosition.getZ(i), capPosition.getX(i));
      const ridge = 1 + 0.06 * Math.cos(angle * 12);
      capPosition.setXYZ(i, capPosition.getX(i) * ridge, capPosition.getY(i), capPosition.getZ(i) * ridge);
    }
    capGeometry.computeVertexNormals();
    const cap = new THREE.Mesh(capGeometry, gold);
    cap.position.y = centerY + KNIT_RADIUS + CAP_HEIGHT / 2 - 0.012;

    const ringGeometry = new THREE.TorusGeometry(0.018, 0.005, 10, 24);
    const ring = new THREE.Mesh(ringGeometry, gold);
    ring.position.y = cap.position.y + CAP_HEIGHT / 2 + 0.014;

    group.add(core, stitches, cap, ring);
    return {
      group,
      disposables: [yarn, filling, gold, stitchGeometry, fillingGeometry, capGeometry, ringGeometry, fuzz],
    };
  }, [hex]);

  useEffect(() => () => ornament.disposables.forEach((item) => item.dispose()), [ornament]);

  return (
    <HangingCharm
      {...props}
      rodLength={ROD_LENGTH}
      padding={KNIT_RADIUS + 0.05}
      pokeRadius={KNIT_RADIUS * 1.15}
      loop={{ radius: 0.15, scale: 1.1 }}
      cord={{ hex: GOLD, radius: 0.008, length: CORD_LENGTH + 0.01, finish: "satin" }}
    >
      <primitive object={ornament.group} />
    </HangingCharm>
  );
}
