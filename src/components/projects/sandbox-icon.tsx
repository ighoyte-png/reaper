import { cn } from "@/lib/cn";

/**
 * Isometric sandbox with a kids' bucket and shovel.
 * Strict gray tones only (no pure white / no hue) so it reads on light and dark themes.
 */
export function SandboxIcon({
  className,
}: {
  className?: string;
}) {
  // Mid grays only — no #fff, no chromatic CSS tokens.
  const g1 = "#555555";
  const g2 = "#6a6a6a";
  const g3 = "#808080";
  const g4 = "#959595";
  const g5 = "#aaaaaa";

  // Outer isometric diamond (sandbox rim)
  const N = { x: 60, y: 22 };
  const E = { x: 100, y: 46 };
  const S = { x: 60, y: 70 };
  const W = { x: 20, y: 46 };
  const depth = 20;

  // Sand inset
  const sn = { x: 60, y: 34 };
  const se = { x: 86, y: 48 };
  const ss = { x: 60, y: 62 };
  const sw = { x: 34, y: 48 };

  return (
    <svg
      viewBox="0 0 120 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden
    >
      {/* Front-left wall */}
      <path
        d={`M${W.x} ${W.y} L${S.x} ${S.y} L${S.x} ${S.y + depth} L${W.x} ${W.y + depth} Z`}
        fill={g2}
        stroke={g1}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Front-right wall */}
      <path
        d={`M${E.x} ${E.y} L${S.x} ${S.y} L${S.x} ${S.y + depth} L${E.x} ${E.y + depth} Z`}
        fill={g3}
        stroke={g1}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {/* Inner back faces (above sand) */}
      <path
        d={`M${sw.x} ${sw.y} L${sn.x} ${sn.y} L${se.x} ${se.y} L${W.x + 6} ${W.y + 2} L${N.x} ${N.y + 8} L${E.x - 6} ${E.y + 2} Z`}
        fill={g2}
        opacity="0.45"
      />

      {/* Sand bed */}
      <path
        d={`M${sn.x} ${sn.y} L${se.x} ${se.y} L${ss.x} ${ss.y} L${sw.x} ${sw.y} Z`}
        fill={g5}
        stroke={g3}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d={`M${sw.x + 8} ${sw.y + 2} L${sn.x} ${sn.y + 8} L${se.x - 8} ${se.y + 2}`}
        stroke={g4}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* Rim top faces */}
      <path
        d={`M${W.x} ${W.y} L${N.x} ${N.y} L${N.x} ${N.y + 7} L${W.x + 5} ${W.y + 3} Z`}
        fill={g4}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={`M${E.x} ${E.y} L${N.x} ${N.y} L${N.x} ${N.y + 7} L${E.x - 5} ${E.y + 3} Z`}
        fill={g5}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={`M${W.x} ${W.y} L${S.x} ${S.y} L${S.x} ${S.y - 7} L${W.x + 5} ${W.y - 3} Z`}
        fill={g3}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={`M${E.x} ${E.y} L${S.x} ${S.y} L${S.x} ${S.y - 7} L${E.x - 5} ${E.y - 3} Z`}
        fill={g4}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={`M${N.x} ${N.y} L${E.x} ${E.y} L${S.x} ${S.y} L${W.x} ${W.y} Z`}
        fill="none"
        stroke={g1}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {/* —— Shovel (left, planted in sand) —— */}
      <path
        d="M36 26 L41 54"
        stroke={g2}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M31 23 L41 27.5 L39 30.5 L29 26 Z"
        fill={g3}
        stroke={g1}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M37 52 L48 47 L55 54 L44 59 Z"
        fill={g4}
        stroke={g1}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M44 59 L55 54 L55 57.5 L44 62.5 Z"
        fill={g2}
        stroke={g1}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* —— Bucket (front-right on sand) —— */}
      <path
        d="M64 49 L76 42 L76 63 L64 70 Z"
        fill={g3}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M76 42 L88 49 L88 70 L76 63 Z"
        fill={g4}
        stroke={g1}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse
        cx="76"
        cy="44.5"
        rx="12"
        ry="7"
        fill={g2}
        stroke={g1}
        strokeWidth="1.5"
      />
      <ellipse
        cx="76"
        cy="44.5"
        rx="9"
        ry="4.8"
        fill="none"
        stroke={g5}
        strokeWidth="1.2"
        opacity="0.8"
      />
      <path
        d="M66 47 Q76 30 86 47"
        stroke={g1}
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M70 47 Q76 41.5 82 47 Q76 51 70 47 Z"
        fill={g5}
      />
    </svg>
  );
}
