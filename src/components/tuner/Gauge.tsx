import { cn } from "@/lib/utils";
import { noteFromMidi } from "@/lib/chromatic";

interface GaugeProps {
  cents: number | null;
  centerMidi: number | null;
  leftHanded?: boolean;
}

const IN_TUNE = 5;
const NEAR_TUNE = 20;
const SEGMENTS = 21; // odd → true center segment
const CENTER = Math.floor(SEGMENTS / 2);
// ±5¢ tolerance band = center segment + 1 on each side (segment ≈ 5¢ wide).
const TOLERANCE_HALF = 1;

// LED VU-meter style horizontal gauge. Segments light from center outward
// toward the current cents position; center band stays green (in-tune zone).
export function Gauge({ cents, centerMidi, leftHanded }: GaugeProps) {
  const hasSignal = cents !== null && centerMidi !== null;
  const clamped = hasSignal ? Math.max(-50, Math.min(50, cents)) : 0;
  const oriented = leftHanded ? -clamped : clamped;
  // Map -50..50 → 0..SEGMENTS-1
  const activeIdx = hasSignal
    ? Math.round(((oriented + 50) / 100) * (SEGMENTS - 1))
    : CENTER;

  const abs = hasSignal ? Math.abs(cents) : Infinity;
  const inTune = abs <= IN_TUNE;
  const near = abs <= NEAR_TUNE;

  const activeColor = !hasSignal
    ? "muted"
    : inTune
      ? "success"
      : near
        ? "primary"
        : "destructive";

  const offsets = leftHanded ? [2, 1, 0, -1, -2] : [-2, -1, 0, 1, 2];
  const labels = offsets.map((o) => ({
    offset: o,
    name: centerMidi !== null ? noteFromMidi(centerMidi + o).name : "·",
  }));

  return (
    <div className="w-full select-none">
      {/* LED bar */}
      <div
        className="relative rounded-md border border-black/60 bg-black/70 p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.7)]"
      >
        <div className="flex h-10 items-stretch gap-[3px]">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const distFromCenter = i - CENTER;
            const distFromActive = i - activeIdx;
            const inTolerance = Math.abs(distFromCenter) <= TOLERANCE_HALF;

            // Segment lights if it sits between center and active idx (VU sweep),
            // or if it is the active segment itself, or in the tolerance band
            // while we have signal & are in tune.
            const between =
              hasSignal &&
              ((distFromActive <= 0 && distFromCenter >= 0) ||
                (distFromActive >= 0 && distFromCenter <= 0));

            let color: "off" | "success" | "primary" | "destructive" | "muted" =
              "off";
            if (inTolerance) {
              color = hasSignal && inTune ? "success" : "success";
            }
            if (between) {
              color = activeColor;
            }
            // The active segment is always fully lit in its color.
            if (i === activeIdx && hasSignal) color = activeColor;

            const dim = !between && !(inTolerance && hasSignal && inTune);

            const classes = cn(
              "flex-1 rounded-[2px] transition-colors duration-75",
              color === "off" && "bg-white/[0.04]",
              color === "muted" && "bg-white/[0.06]",
              color === "success" &&
                (dim
                  ? "bg-[color:var(--success)]/25"
                  : "bg-[color:var(--success)] shadow-[0_0_8px_var(--success)]"),
              color === "primary" &&
                (dim
                  ? "bg-primary/25"
                  : "bg-primary shadow-[0_0_8px_var(--primary)]"),
              color === "destructive" &&
                (dim
                  ? "bg-destructive/25"
                  : "bg-destructive shadow-[0_0_8px_var(--destructive)]"),
            );
            return <div key={i} className={classes} />;
          })}
        </div>

        {/* Tolerance band overlay markers */}
        <div className="pointer-events-none absolute inset-y-1 left-0 right-0">
          <div
            className="absolute top-0 h-full border-x border-[color:var(--success)]/40"
            style={{
              left: `${((CENTER - TOLERANCE_HALF) / SEGMENTS) * 100}%`,
              width: `${((TOLERANCE_HALF * 2 + 1) / SEGMENTS) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Note labels row (adjacent chromatic notes) */}
      <div className="mt-2 grid grid-cols-5 font-display text-base font-semibold uppercase tracking-wide">
        {labels.map((l, i) => (
          <span
            key={i}
            className={cn(
              "text-center tabular-nums",
              l.offset === 0
                ? hasSignal && inTune
                  ? "text-[color:var(--success)]"
                  : hasSignal
                    ? "text-primary"
                    : "text-foreground"
                : "text-muted-foreground/60",
            )}
          >
            {l.name}
          </span>
        ))}
      </div>

      {/* Cents scale legend */}
      <div className="mt-1 flex justify-between px-1 font-mono text-[10px] text-muted-foreground tabular-nums">
        <span>{leftHanded ? "+50" : "-50"}</span>
        <span>-25</span>
        <span className="text-[color:var(--success)]">0¢</span>
        <span>+25</span>
        <span>{leftHanded ? "-50" : "+50"}</span>
      </div>
    </div>
  );
}
