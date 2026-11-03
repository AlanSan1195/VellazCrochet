import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type CSSProperties, type RefObject } from "react";
import type { ScrollProgress } from "../three/InteractiveStage";
import type { BagProduct, Colorway } from "../types/catalog";
import { ColorwayPicker } from "./ColorwayPicker";
import { ExtrasToggle } from "./ExtrasToggle";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Props = {
  bag: BagProduct;
  index: number;
  total: number;
  colorways: Colorway[];
  colorway: Colorway;
  visibleExtraIds: string[];
  scroll: ScrollProgress;
  track: RefObject<HTMLDivElement | null>;
  onColorway: (colorwayId: string) => void;
  onToggleExtra: (extraId: string) => void;
  onReset: () => void;
  onActive: (index: number) => void;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Una sección por bolso: el bolso sube con el scroll y el texto entra por capas. */
export function BagSection({
  bag,
  index,
  total,
  colorways,
  colorway,
  visibleExtraIds,
  scroll,
  track,
  onColorway,
  onToggleExtra,
  onReset,
  onActive,
}: Props) {
  const section = useRef<HTMLElement>(null);
  const flipped = index % 2 === 1;

  useGSAP(
    () => {
      const enter = ScrollTrigger.create({
        trigger: track.current,
        start: "top bottom",
        end: "center 58%",
        onUpdate: (self) => (scroll.enter = self.progress),
      });
      const exit = ScrollTrigger.create({
        trigger: track.current,
        start: "bottom 55%",
        end: "bottom top",
        onUpdate: (self) => (scroll.exit = self.progress),
      });
      scroll.enter = enter.progress;
      scroll.exit = exit.progress;

      ScrollTrigger.create({
        trigger: section.current,
        start: "top center",
        end: "bottom center",
        onToggle: (self) => {
          if (self.isActive) onActive(index);
          // Al volver a la portada desde el primer bolso, la navegación se oculta.
          else if (index === 0 && self.direction < 0) onActive(-1);
        },
      });

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-reveal]", {
          y: 48,
          autoAlpha: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: section.current, start: "top 62%" },
        });
        gsap.fromTo(
          "[data-ghost]",
          { yPercent: 35 },
          {
            yPercent: -35,
            ease: "none",
            scrollTrigger: { trigger: section.current, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
      return () => media.revert();
    },
    { scope: section },
  );

  const [toneA, toneB = toneA] = colorway.tones;
  const tint = { "--tint-a": toneA, "--tint-b": toneB } as CSSProperties;

  return (
    <section
      ref={section}
      id={bag.id}
      aria-labelledby={`${bag.id}-title`}
      style={tint}
      className="tinted relative isolate flex min-h-dvh items-center overflow-hidden py-16 md:py-24"
    >
      <p
        data-ghost
        aria-hidden="true"
        className="ghost-name pointer-events-none absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 text-center font-display text-[30vw] leading-none font-semibold italic select-none md:text-[22vw]"
      >
        {bag.name}
      </p>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 md:grid-cols-12 md:grid-rows-[1fr_auto_1fr] md:gap-x-10 md:px-8">
        <header
          className={`md:col-span-5 md:row-start-1 md:row-end-3 md:self-end ${flipped ? "md:col-start-8" : "md:col-start-1"}`}
        >
          <p data-reveal className="font-display text-sm tracking-[0.3em] text-ink/60 uppercase">
            {pad(index + 1)} / {pad(total)}
          </p>
          <h2 id={`${bag.id}-title`} data-reveal className="mt-2 font-display text-6xl leading-[0.95] font-semibold text-ink md:text-8xl">
            {bag.name}
          </h2>
          <p data-reveal className="mt-3 text-lg text-ink/80">
            {bag.tagline}
          </p>
          <p data-reveal className="mt-4 max-w-md leading-relaxed text-ink/70">
            {bag.description}
          </p>
        </header>

        <div
          ref={track}
          role="img"
          aria-label={`Modelo 3D de ${bag.name} en ${colorway.name}. Arrastra para girarlo y toca la tela.`}
          style={{ touchAction: "pan-y" }}
          className={`relative h-[60svh] cursor-grab active:cursor-grabbing md:col-span-7 md:row-span-3 md:row-start-1 md:h-[80svh] ${flipped ? "md:col-start-1" : "md:col-start-6"}`}
        />

        <div
          data-reveal
          className={`md:col-span-5 md:row-start-3 md:self-start md:pt-8 ${flipped ? "md:col-start-8" : "md:col-start-1"}`}
        >
          <Controls
            bag={bag}
            colorways={colorways}
            colorway={colorway}
            visibleExtraIds={visibleExtraIds}
            onColorway={onColorway}
            onToggleExtra={onToggleExtra}
            onReset={onReset}
          />
        </div>
      </div>
    </section>
  );
}

type ControlsProps = Pick<
  Props,
  "bag" | "colorways" | "colorway" | "visibleExtraIds" | "onColorway" | "onToggleExtra" | "onReset"
>;

function Controls({ bag, colorways, colorway, visibleExtraIds, onColorway, onToggleExtra, onReset }: ControlsProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-3 text-sm text-ink/70">
          {colorway.tones.length > 1 ? "Combinación" : "Color"}:{" "}
          <span className="font-medium text-ink">{colorway.name}</span>
        </p>
        <ColorwayPicker name={`${bag.id}-color`} colorways={colorways} value={colorway.id} onChange={onColorway} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ExtrasToggle extras={bag.extras} visibleIds={visibleExtraIds} onToggle={onToggleExtra} />
        <button
          type="button"
          onClick={onReset}
          className="min-h-11 cursor-pointer px-2 text-sm text-ink underline decoration-ink/30 underline-offset-4 transition hover:decoration-ink"
        >
          Reiniciar vista
        </button>
      </div>
    </div>
  );
}
