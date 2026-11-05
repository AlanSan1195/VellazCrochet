import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ExtraModelProps } from "../registry";
import { HangingCharm } from "./HangingCharm";

const RADIUS = 0.13;
const CORD_LENGTH = 0.22;
const CAP_HEIGHT = 0.05;
const ROD_LENGTH = CORD_LENGTH + CAP_HEIGHT + RADIUS;
const GOLD = "#D4AF5A";

/** Esfera navideña de vidrio con tapa dorada, colgada de un cordón dorado. */
export function OrnamentCharm(props: ExtraModelProps) {
  const { hex } = props.extra;

  const ornament = useMemo(() => {
    const group = new THREE.Group();
    const centerY = -ROD_LENGTH;

    const glass = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.08,
      metalness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
    const gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.28 });

    const sphereGeometry = new THREE.SphereGeometry(RADIUS, 64, 48);
    const sphere = new THREE.Mesh(sphereGeometry, glass);
    sphere.position.y = centerY;

    // Tapa dorada con estrías y la argolla de la que sale el cordón.
    const capGeometry = new THREE.CylinderGeometry(0.036, 0.04, CAP_HEIGHT, 24, 1);
    const capPosition = capGeometry.getAttribute("position");
    for (let i = 0; i < capPosition.count; i++) {
      const angle = Math.atan2(capPosition.getZ(i), capPosition.getX(i));
      const ridge = 1 + 0.06 * Math.cos(angle * 12);
      capPosition.setXYZ(i, capPosition.getX(i) * ridge, capPosition.getY(i), capPosition.getZ(i) * ridge);
    }
    capGeometry.computeVertexNormals();
    const cap = new THREE.Mesh(capGeometry, gold);
    cap.position.y = centerY + RADIUS + CAP_HEIGHT / 2 - 0.012;

    const ringGeometry = new THREE.TorusGeometry(0.018, 0.005, 10, 24);
    const ring = new THREE.Mesh(ringGeometry, gold);
    ring.position.y = cap.position.y + CAP_HEIGHT / 2 + 0.014;

    group.add(sphere, cap, ring);
    return { group, disposables: [glass, gold, sphereGeometry, capGeometry, ringGeometry] };
  }, [hex]);

  useEffect(() => () => ornament.disposables.forEach((item) => item.dispose()), [ornament]);

  return (
    <HangingCharm
      {...props}
      rodLength={ROD_LENGTH}
      padding={RADIUS + 0.07}
      pokeRadius={RADIUS * 1.15}
      loop={{ radius: 0.15, scale: 1.1 }}
      cord={{ hex: GOLD, radius: 0.008, length: CORD_LENGTH + 0.01, finish: "satin" }}
    >
      <primitive object={ornament.group} />
    </HangingCharm>
  );
}
