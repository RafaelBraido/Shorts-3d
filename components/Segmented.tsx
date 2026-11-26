"use client";

import { useId } from "react";

interface Option<T> {
  value: T;
  label: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={label}
      style={{ "--n": options.length, "--i": index } as React.CSSProperties}
    >
      <span className="seg-thumb" aria-hidden />
      {options.map((o) => (
        <label key={String(o.value)} className="seg-opt" data-checked={o.value === value}>
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
