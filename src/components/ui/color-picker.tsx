"use client";

import { cn } from "@/lib/cn";
import { PRESET_COLORS } from "@/lib/domain/colors";

export { PRESET_COLORS };

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="mt-1 w-full space-y-2">
      <div className="flex w-full flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={cn(
              "h-7 w-7 shrink-0 rounded-full border-2",
              value.toLowerCase() === color.toLowerCase()
                ? "border-[var(--text)]"
                : "border-transparent",
            )}
            style={{ background: color }}
            onClick={() => onChange(color)}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>
      <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--text-muted)]">
        Custom
        <input
          type="color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#3498DB"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
