import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import * as THREE from "three";
import type { BagProduct } from "../types/catalog";
import { DEFAULT_DISTANCE, INITIAL_ROTATION, InteractiveStage, type ScrollProgress } from "./InteractiveStage";
import { createStudioEnvironment } from "./lib/studioEnvironment";
import { getYarnTextures } from "./lib/yarnTexture";
import { KnitBag } from "./models/KnitBag";
import { bagRegistry, extraRegistry } from "./registry";
import { StageContext, createStage } from "./stage";

/** En móvil una densidad de 1.5 se ve nítida y dibuja la mitad de píxeles que 2 (o 3). */
const COARSE_POINTER = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const DPR: [number, number] = [1, COARSE_POINTER ? 1.5 : 2];

function createShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(40,30,70,0.2)");
  gradient.addColorStop(0.55, "rgba(40,30,70,0.07)");
  gradient.addColorStop(1, "rgba(40,30,70,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
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

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const target = createStudioEnvironment(gl);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Compila los shaders y sube las texturas en cuanto el bolso existe, aunque todavía no
 * se vea: así no hay un tirón la primera vez que entra en pantalla al hacer scroll.
 */
function Warmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const { albedo, bump } = getYarnTextures();
    gl.initTexture(albedo);
    gl.initTexture(bump);
    gl.compileAsync(scene, camera).catch(() => {});
  }, [gl, scene, camera]);
  return null;
}

type Props = {
  bag: BagProduct;
  tones: string[];
  visibleExtraIds: string[];
  resetSignal: number;
  scroll: ScrollProgress;
  reducedMotion: boolean;
  /** Elemento del DOM que ocupa el bolso: recibe los gestos. */
  track: RefObject<HTMLDivElement | null>;
  /** Solo se anima mientras la sección está en pantalla. */
  active: boolean;
};

/**
 * Un canvas por bolso, dentro de su sección: se desplaza con la página de forma nativa,
 * en vez de redibujarse para seguir el scroll, y se detiene cuando no se ve.
 */
export default function BagCanvas({ bag, tones, visibleExtraIds, resetSignal, scroll, reducedMotion, track, active }: Props) {
  const definition = bagRegistry[bag.modelKey];
  if (!definition) throw new Error(`Bolso sin modelo registrado: ${bag.modelKey}`);
  const { blueprint, centerY } = definition;
  const stage = useMemo(() => createStage(INITIAL_ROTATION), []);

  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => setElement(track.current), [track]);

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={DPR}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, DEFAULT_DISTANCE], fov: 32 }}
      // El tamaño solo cambia al redimensionar; no hace falta medir en cada scroll.
      resize={{ scroll: false, debounce: { scroll: 0, resize: 120 } }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      fallback={
        <p className="grid h-full place-items-center px-6 text-center text-ink/70">
          Tu navegador no tiene WebGL activo, así que este bolso no se puede ver en 3D.
        </p>
      }
      aria-hidden="true"
    >
      <StageContext.Provider value={stage}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[2.5, 3.5, 4]} intensity={2.4} />
        <directionalLight position={[-3, 1, -2]} intensity={0.9} color="#e8e4ff" />
        <StudioEnvironment />

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
            <Warmup />
          </InteractiveStage>
        )}
        <GroundShadow />
      </StageContext.Provider>
    </Canvas>
  );
}
