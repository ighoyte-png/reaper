/** Lightweight confetti burst (same system as the approve celebration mock). */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  rotation: number;
  rotSpeed: number;
};

const COLORS = [
  "#a855f7",
  "#22c55e",
  "#ec4899",
  "#3b82f6",
  "#eab308",
  "#ffffff",
];

const CANVAS_ID = "reaper-celebration-canvas";

function ensureCanvas(): HTMLCanvasElement {
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "9999",
    });
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  return canvas;
}

function burstParticles(
  particles: Particle[],
  x: number,
  y: number,
  count = 70,
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 4 + Math.random() * 9;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 2,
      size: Math.random() * 6 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      alpha: 1,
      decay: 0.015 + Math.random() * 0.015,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
    });
  }
}

/**
 * Fire a particle burst at viewport pixel coordinates (button center).
 * Canvas sits above the modal (z-index 9999).
 */
export function fireCelebrationBurst(clientX: number, clientY: number) {
  if (typeof window === "undefined") return;

  const canvas = ensureCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles: Particle[] = [];
  burstParticles(particles, clientX, clientY);
  // Second wave like a stronger “glory” beat
  window.setTimeout(() => {
    burstParticles(particles, clientX, clientY, 40);
  }, 120);

  let running = true;
  const onResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", onResize);

  function frame() {
    if (!running || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.alpha -= p.decay;
      p.rotation += p.rotSpeed;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    }

    if (particles.length > 0) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  requestAnimationFrame(frame);
}
