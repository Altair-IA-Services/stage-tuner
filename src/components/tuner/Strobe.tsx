import { useEffect, useRef } from "react";

interface StrobeProps {
  cents: number | null;
  active: boolean;
  leftHanded?: boolean;
}

// A strobe visualizer: bands scroll left/right at a speed proportional to cents error.
// When perfectly in tune, bands stand still.
export function Strobe({ cents, active, leftHanded }: StrobeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const last = useRef(performance.now());
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (active && cents !== null) {
        const dir = leftHanded ? -1 : 1;
        // 1 cent -> ~4 px/s scroll
        offset.current += cents * 4 * dt * dir;
      }
      if (ref.current) {
        ref.current.style.backgroundPosition = `${offset.current}px 0`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [cents, active, leftHanded]);

  return (
    <div
      ref={ref}
      className="h-24 w-full rounded-2xl border border-border/60 bg-card"
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, oklch(0.85 0.2 145) 0 24px, oklch(0.15 0.02 240) 24px 48px)",
        backgroundSize: "48px 100%",
        opacity: active && cents !== null ? 1 : 0.35,
        transition: "opacity 200ms",
      }}
    />
  );
}
