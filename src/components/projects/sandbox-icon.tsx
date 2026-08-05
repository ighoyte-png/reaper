"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Isometric wooden sandbox with beach ball — stroke + token fills match
 * other app decorative icons (currentColor outlines, CSS variables).
 */
export function SandboxIcon({
  className,
}: {
  className?: string;
}) {
  const clipId = `sandbox-ball-${useId().replace(/:/g, "")}`;
  // Diamond corners (isometric top square)
  const N = { x: 60, y: 22 };
  const E = { x: 102, y: 46 };
  const S = { x: 60, y: 70 };
  const W = { x: 18, y: 46 };
  const depth = 22;
  const wallN = { x: N.x, y: N.y + depth };
  const wallE = { x: E.x, y: E.y + depth };
  const wallS = { x: S.x, y: S.y + depth };
  const wallW = { x: W.x, y: W.y + depth };
  // Sand inset from rim
  const sandN = { x: 60, y: 32 };
  const sandE = { x: 90, y: 48 };
  const sandS = { x: 60, y: 64 };
  const sandW = { x: 30, y: 48 };

  return (
    <svg
      viewBox="0 0 120 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[var(--text-muted)]", className)}
      aria-hidden
    >
      {/* Inner back faces above sand */}
      <path
        d={`M${sandW.x} ${sandW.y} L${sandN.x} ${sandN.y} L${sandE.x} ${sandE.y} L${W.x + 8} ${W.y + 2} L${N.x} ${N.y + 8} L${E.x - 8} ${E.y + 2} Z`}
        fill="var(--border)"
        opacity="0.65"
      />

      {/* Front-left wall */}
      <path
        d={`M${W.x} ${W.y} L${S.x} ${S.y} L${wallS.x} ${wallS.y} L${wallW.x} ${wallW.y} Z`}
        fill="var(--row-hover)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Front-right wall */}
      <path
        d={`M${E.x} ${E.y} L${S.x} ${S.y} L${wallS.x} ${wallS.y} L${wallE.x} ${wallE.y} Z`}
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Sand surface */}
      <path
        d={`M${sandN.x} ${sandN.y} L${sandE.x} ${sandE.y} L${sandS.x} ${sandS.y} L${sandW.x} ${sandW.y} Z`}
        fill="color-mix(in srgb, var(--status-near) 32%, var(--bg-elevated))"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Rim top faces */}
      <path
        d={`M${W.x} ${W.y} L${N.x} ${N.y} L${N.x} ${N.y + 7} L${W.x + 6} ${W.y + 4} Z`}
        fill="var(--bg-elevated)"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d={`M${E.x} ${E.y} L${N.x} ${N.y} L${N.x} ${N.y + 7} L${E.x - 6} ${E.y + 4} Z`}
        fill="var(--bg-elevated)"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d={`M${W.x} ${W.y} L${S.x} ${S.y} L${S.x} ${S.y - 7} L${W.x + 6} ${W.y - 4} Z`}
        fill="var(--bg-elevated)"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d={`M${E.x} ${E.y} L${S.x} ${S.y} L${S.x} ${S.y - 7} L${E.x - 6} ${E.y - 4} Z`}
        fill="var(--bg-elevated)"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Outer diamond outline */}
      <path
        d={`M${N.x} ${N.y} L${E.x} ${E.y} L${S.x} ${S.y} L${W.x} ${W.y} Z`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Beach ball (clipped so bottom sits in sand) */}
      <defs>
        <clipPath id={clipId}>
          <rect x="44" y="24" width="32" height="30" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle
          cx="60"
          cy="46"
          r="13"
          fill="var(--bg-elevated)"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M60 33 A13 13 0 0 1 71.3 39.5 L60 46 Z"
          fill="var(--status-over)"
          fillOpacity="0.9"
        />
        <path
          d="M71.3 39.5 A13 13 0 0 1 71.3 52.5 L60 46 Z"
          fill="var(--bg-elevated)"
        />
        <path
          d="M71.3 52.5 A13 13 0 0 1 60 59 L60 46 Z"
          fill="var(--accent)"
          fillOpacity="0.95"
        />
        <path
          d="M60 59 A13 13 0 0 1 48.7 52.5 L60 46 Z"
          fill="var(--status-near)"
        />
        <path
          d="M48.7 52.5 A13 13 0 0 1 48.7 39.5 L60 46 Z"
          fill="var(--bg-elevated)"
        />
        <path
          d="M48.7 39.5 A13 13 0 0 1 60 33 L60 46 Z"
          fill="var(--accent)"
          fillOpacity="0.55"
        />
        <circle
          cx="60"
          cy="33"
          r="3"
          fill="var(--bg-elevated)"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle
          cx="60"
          cy="46"
          r="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </g>
    </svg>
  );
}
