import { cn } from "@/lib/cn";

/** Isometric sandbox with bucket + shovel; stroke style matches app icons. */
export function SandboxIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[var(--text-muted)]", className)}
      aria-hidden
    >
      {/* Sand box bed */}
      <path
        d="M14 58 L60 40 L106 58 L60 76 Z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
        fill="var(--bg-elevated)"
      />
      {/* Left wall */}
      <path
        d="M14 58 L14 72 L60 90 L60 76 Z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
        fill="var(--row-hover)"
      />
      {/* Right wall */}
      <path
        d="M106 58 L106 72 L60 90 L60 76 Z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
        fill="var(--bg)"
      />
      {/* Sand piles */}
      <path
        d="M34 62 C40 52, 48 52, 54 60 C58 54, 66 54, 72 62 C76 56, 86 58, 88 64 L34 64 Z"
        fill="var(--accent)"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Bucket body */}
      <path
        d="M42 48 L46 36 H58 L62 48 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="var(--bg-elevated)"
      />
      <path
        d="M46 36 H58"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Bucket handle */}
      <path
        d="M48 36 C48 30, 56 30, 56 36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Shovel handle */}
      <path
        d="M78 28 L88 52"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      {/* Shovel grip */}
      <path
        d="M74 24 L82 28"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      {/* Shovel blade */}
      <path
        d="M84 48 C90 50, 94 56, 90 60 C86 58, 82 54, 84 48 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="var(--bg-elevated)"
      />
    </svg>
  );
}
