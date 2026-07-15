"use client";

import { cn } from "@/lib/cn";

export const PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#84CC16",
  "#6366F1",
  "#D946EF",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "h-7 w-7 rounded-full border-2",
            value.toLowerCase() === color.toLowerCase()
              ? "border-[var(--text)]"
              : "border-transparent",
          )}
          style={{ background: color }}
          onClick={() => onChange(color)}
          aria-label={`Color ${color}`}
        />
      ))}
      <label className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--text-muted)]">
        Custom
        <input
          type="color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#3B82F6"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
