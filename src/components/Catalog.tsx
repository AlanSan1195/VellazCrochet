import { createRef, useEffect, useMemo, useState } from "react";
import { bags } from "../data/bags";
import { getColorways } from "../data/colorways";
import type { ScrollProgress } from "../three/InteractiveStage";
import { BagSection, loadBagCanvas } from "./BagSection";

type BagState = { colorwayId: string; visibleExtraIds: string[]; resetSignal: number };

/**
 * Catálogo completo en una isla de React. Las secciones son DOM normal y aparecen al
 * instante; Three.js llega en un paquete aparte y cada bolso dibuja en su propio canvas.
 */
export default function Catalog() {
  const catalog = useMemo(
    () =>
      bags.map((bag) => ({
        bag,
        colorways: getColorways(bag.colorwayIds),
        track: createRef<HTMLDivElement>(),
        scroll: { enter: 0, exit: 0 } as ScrollProgress,
      })),
    [],
  );

  const [states, setStates] = useState<Record<string, BagState>>(() =>
    Object.fromEntries(
      bags.map((bag) => [
        bag.id,
        {
          colorwayId: bag.colorwayIds[0]!,
          visibleExtraIds: bag.extras.filter((extra) => extra.defaultVisible).map((extra) => extra.id),
          resetSignal: 0,
        },
      ]),
    ),
  );
  const [active, setActive] = useState(-1);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Mientras se lee la portada se descarga el 3D, para tenerlo listo al llegar al primer bolso.
  useEffect(() => void loadBagCanvas(), []);

  const update = (bagId: string, change: (state: BagState) => Partial<BagState>) =>
    setStates((all) => ({ ...all, [bagId]: { ...all[bagId]!, ...change(all[bagId]!) } }));

  return (
    <>
      <nav
        aria-label="Modelos del catálogo"
        className={`fixed top-1/2 left-6 z-20 hidden -translate-y-1/2 transition duration-500 lg:block ${active < 0 ? "pointer-events-none -translate-x-4 opacity-0" : ""}`}
      >
        <ol className="space-y-3">
          {catalog.map(({ bag }, index) => (
            <li key={bag.id}>
              <a
                href={`#${bag.id}`}
                aria-current={active === index ? "true" : undefined}
                className="group flex items-center gap-3 text-sm text-ink/50 transition hover:text-ink aria-[current]:text-ink"
              >
                <span className="h-px w-6 bg-current transition-all group-aria-[current]:w-12" />
                <span className="font-display">{String(index + 1).padStart(2, "0")}</span>
                {bag.name}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {catalog.map(({ bag, colorways, track, scroll }, index) => {
        const state = states[bag.id]!;
        return (
          <BagSection
            key={bag.id}
            bag={bag}
            index={index}
            total={catalog.length}
            colorways={colorways}
            colorway={colorways.find((item) => item.id === state.colorwayId)!}
            visibleExtraIds={state.visibleExtraIds}
            resetSignal={state.resetSignal}
            reducedMotion={reducedMotion}
            scroll={scroll}
            track={track}
            onColorway={(colorwayId) => update(bag.id, () => ({ colorwayId }))}
            onToggleExtra={(extraId) =>
              update(bag.id, ({ visibleExtraIds }) => ({
                visibleExtraIds: visibleExtraIds.includes(extraId)
                  ? visibleExtraIds.filter((id) => id !== extraId)
                  : [...visibleExtraIds, extraId],
              }))
            }
            onReset={() => update(bag.id, ({ resetSignal }) => ({ resetSignal: resetSignal + 1 }))}
            onActive={setActive}
          />
        );
      })}
    </>
  );
}
