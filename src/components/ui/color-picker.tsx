"use client";

import { cn } from "@/lib/cn";

export const PRESET_COLORS = [
  "#E74C3C", // Crimson Red
  "#FF6F00", // Blaze Orange
  "#FFC300", // Gold Yellow
  "#8BC34A", // Lime Green
  "#27AE60", // Emerald Green
  "#3498DB", // Sky Blue
  "#1976D2", // Royal Blue
  "#212121", // Charcoal Grey
  "#455A64", // Slate Grey
  "#673AB7", // Deep Purple
  "#F48FB1", // Rose Pink
  "#00ACC1", // Cyan Teal
  "#00796B", // Forest Teal
  "#8D6E63", // Bronze Brown
  "#A1887F", // Taupe Beige
  "#607D8B", // Blue Grey
];

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
