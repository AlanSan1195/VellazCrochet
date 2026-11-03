import { Environment, Lightformer, PerspectiveCamera, View } from "@react-three/drei";
import { useEffect, useMemo, useState, type RefObject } from "react";
import * as THREE from "three";
import type { BagProduct } from "../types/catalog";
import { DEFAULT_DISTANCE, INITIAL_ROTATION, InteractiveStage, type ScrollProgress } from "./InteractiveStage";
import { KnitBag } from "./models/KnitBag";
import { bagRegistry, extraRegistry } from "./registry";
import { StageContext, createStage } from "./stage";

function createShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(40,30,70,0.2)");
  gradient.addColorStop(0.55, "rgba(40,30,70,0.07)");
  gradient.addColorStop(1, "rgba(40,30,70,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function GroundShadow() {
  const texture = useMemo(createShadowTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, -1.14, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.9, 1, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

type Props = {
  bag: BagProduct;
  tones: string[];
  visibleExtraIds: string[];
  resetSignal: number;
  scroll: ScrollProgress;
  reducedMotion: boolean;
  /** Elemento del DOM que ocupa el bolso: define el área de dibujo y recibe los gestos. */
  track: RefObject<HTMLDivElement | null>;
  index: number;
};

/** Un bolso dentro del canvas compartido: su propia cámara, luces y física. */
export function BagView({ bag, tones, visibleExtraIds, resetSignal, scroll, reducedMotion, track, index }: Props) {
  const definition = bagRegistry[bag.modelKey];
  if (!definition) throw new Error(`Bolso sin modelo registrado: ${bag.modelKey}`);
  const { blueprint, centerY } = definition;
  const stage = useMemo(() => createStage(INITIAL_ROTATION), []);

  // El elemento existe después del primer render; hasta entonces no hay dónde escuchar gestos.
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => setElement(track.current), [track]);

  return (
    <View track={track as RefObject<HTMLElement>} index={index}>
      <PerspectiveCamera makeDefault position={[0, 0, DEFAULT_DISTANCE]} fov={32} />
      <StageContext.Provider value={stage}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[2.5, 3.5, 4]} intensity={2.4} />
        <directionalLight position={[-3, 1, -2]} intensity={0.9} color="#e8e4ff" />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={1.6} position={[0, 4, 3]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={0.9} position={[-5, 0, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={0.7} position={[5, 0, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={0.5} position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
        </Environment>

        {element && (
          <InteractiveStage
            stage={stage}
            element={element}
            centerY={centerY}
            resetSignal={resetSignal}
            scroll={scroll}
            reducedMotion={reducedMotion}
          >
            <KnitBag blueprint={blueprint} tones={tones} />
            {bag.extras
              .filter((extra) => visibleExtraIds.includes(extra.id))
              .map((extra) => {
                const Extra = extraRegistry[extra.modelKey];
                if (!Extra) throw new Error(`Extra sin modelo registrado: ${extra.modelKey}`);
                return <Extra key={extra.id} extra={extra} collider={blueprint.shape.collider} />;
              })}
          </InteractiveStage>
        )}
        <GroundShadow />
      </StageContext.Provider>
    </View>
  );
}
