import type { Colorway } from "../types/catalog";

type Props = {
  name: string;
  colorways: Colorway[];
  value: string;
  onChange: (colorwayId: string) => void;
};

/** Muestra lisa o partida en diagonal para las combinaciones bicolor. */
export function swatchBackground({ tones: [a, b] }: Colorway) {
  return b ? `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)` : a;
}

export function ColorwayPicker({ name, colorways, value, onChange }: Props) {
  return (
    <fieldset className="flex flex-wrap gap-2.5">
      <legend className="sr-only">Color</legend>
      {colorways.map((colorway, index) => (
        <label key={colorway.id} title={colorway.name} className="relative block size-11 cursor-pointer">
          <input
            type="radio"
            name={name}
            value={colorway.id}
            checked={colorway.id === value}
            onChange={() => onChange(colorway.id)}
            className="peer sr-only"
          />
          <span
            style={{ background: swatchBackground(colorway) }}
            className="block size-full rounded-full border border-ink/15 shadow-sm transition duration-300 peer-checked:scale-90 peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-4 peer-checked:ring-offset-transparent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink"
          />
          <span className="sr-only">
            {colorway.name}
            {index === 0 ? " (original)" : ""}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
