import type { BagExtra } from "../types/catalog";

type Props = {
  extras: BagExtra[];
  visibleIds: string[];
  onToggle: (extraId: string) => void;
};

export function ExtrasToggle({ extras, visibleIds, onToggle }: Props) {
  return (
    <>
      {extras.map((extra) => (
        <label
          key={extra.id}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink/15 bg-white/60 px-4 text-sm text-ink backdrop-blur transition hover:bg-white"
        >
          <input
            type="checkbox"
            checked={visibleIds.includes(extra.id)}
            onChange={() => onToggle(extra.id)}
            className="size-4 accent-ink"
          />
          <span className="size-2.5 rounded-full" style={{ backgroundColor: extra.hex }} aria-hidden="true" />
          {extra.name}
        </label>
      ))}
    </>
  );
}
