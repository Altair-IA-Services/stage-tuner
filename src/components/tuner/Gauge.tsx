import { cn } from "@/lib/utils";
import { noteFromMidi } from "@/lib/chromatic";

interface GaugeProps {
  cents: number | null; // smoothed cents, ~ -50..50
  centerMidi: number | null;
  leftHanded?: boolean;
}

const IN_TUNE = 5;
const NEAR_TUNE = 20;

// Horizontal "ruler" gauge, ±50 cents wide, with adjacent chromatic notes as ticks
// and a floating indicator above that slides left/right and colors by accuracy.
export function Gauge({ cents, centerMidi, leftHanded }: GaugeProps) {
  const hasSignal = cents !== null && centerMidi !== null;
  const clamped = hasSignal ? Math.max(-50, Math.min(50, cents)) : 0;
  const pct = 50 + clamped; // 0..100
  const display = leftHanded ? 100 - pct : pct;

  const abs = hasSignal ? Math.abs(cents) : Infinity;
  const inTune = abs <= IN_TUNE;
  const near = abs <= NEAR_TUNE;

  const indicatorColor = !hasSignal
    ? "bg-muted-foreground/40"
    : inTune
      ? "bg-primary shadow-[0_0_20px_oklch(0.85_0.22_145_/_0.75)]"
      : near
        ? "bg-orange-400 shadow-[0_0_14px_rgba(251,146,60,0.55)]"
        : "bg-destructive shadow-[0_0_14px_rgba(255,60,60,0.55)]";

  // Note labels around the current chromatic center (±2 semitones).
  const offsets = leftHanded ? [2, 1, 0, -1, -2] : [-2, -1, 0, 1, 2];
  const labels = offsets.map((o) => {
    const midi = centerMidi !== null ? centerMidi + o : null;
    return {
      offset: o,
      name: midi !== null ? noteFromMidi(midi).name : "·",
    };
  });

  return (
    <div className="relative w-full select-none">
      {/* Floating indicator */}
      <div className="relative mb-2 h-6">
        <div
          className={cn(
            "absolute top-0 h-6 w-6 -translate-x-1/2 rounded-md transition-[left,background-color,box-shadow] duration-100 ease-out",
            indicatorColor,
          )}
          style={{ left: `${display}%` }}
        />
      </div>

      {/* Ruler */}
      <div className="relative h-16 w-full overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card to-background shadow-inner">
        {/* Green in-tune zone (±5 cents = 10% of 100) */}
        <div
          className={cn(
            "absolute top-0 h-full transition-colors",
            inTune ? "bg-primary/25" : "bg-primary/10",
          )}
          style={{ left: "45%", width: "10%" }}
        />

        {/* Tick marks: 21 ticks across, majors every 5 */}
        <div className="absolute inset-x-0 top-0 flex h-full items-start justify-between px-1">
          {Array.from({ length: 21 }).map((_, i) => {
            const isCenter = i === 10;
            const isMajor = i % 5 === 0;
            return (
              <div
                key={i}
                className={cn(
                  "w-px bg-muted-foreground/40",
                  isMajor ? "h-4" : "h-2",
                  isCenter && "w-0.5 bg-primary/80",
                )}
              />
            );
          })}
        </div>

        {/* Note labels at each major tick position */}
        <div className="absolute inset-x-0 bottom-1 flex justify-between px-1 font-display text-sm">
          {labels.map((l, i) => (
            <span
              key={i}
              className={cn(
                "w-8 -translate-x-1/2 text-center tabular-nums",
                l.offset === 0
                  ? hasSignal
                    ? inTune
                      ? "text-primary font-bold"
                      : "text-foreground font-bold"
                    : "text-muted-foreground font-bold"
                  : "text-muted-foreground/60",
              )}
              style={{ marginLeft: i === 0 ? 0 : undefined }}
            >
              {l.name}
            </span>
          ))}
        </div>
      </div>

      {/* Cents scale legend */}
      <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-muted-foreground tabular-nums">
        <span>{leftHanded ? "+50" : "-50"}</span>
        <span>-25</span>
        <span className="text-primary">0¢</span>
        <span>+25</span>
        <span>{leftHanded ? "-50" : "+50"}</span>
      </div>
    </div>
  );
}
