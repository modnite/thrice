"use client";

/**
 * A quantity control that cannot go past `max`. Minus and plus buttons for taps, and a number box for typing.
 * The parent owns the value and should clamp again on its side; this just makes the limit visible and easy.
 */
export function QtyStepper({
  value,
  onChange,
  max,
  min = 0,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  min?: number;
  size?: "sm" | "md";
}) {
  const atMax = max !== undefined && value >= max;
  const box = size === "sm" ? "h-7" : "h-9";
  const btn = `${box} w-8 shrink-0 text-lg leading-none text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent`;
  return (
    <div className={`inline-flex items-stretch overflow-hidden rounded-lg border border-neutral-300 bg-white ${box}`}>
      <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
        &minus;
      </button>
      <input
        inputMode="numeric"
        aria-label="Quantity"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          onChange(Number.isFinite(n) ? n : value);
        }}
        className="w-10 border-x border-neutral-300 text-center text-sm outline-none"
      />
      <button type="button" aria-label="More" disabled={atMax} onClick={() => onChange(value + 1)} className={btn}>
        +
      </button>
    </div>
  );
}
