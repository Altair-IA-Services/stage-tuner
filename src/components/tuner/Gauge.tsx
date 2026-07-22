import { cn } from "@/lib/utils";

interface GaugeProps {
  cents: number | null; // -50..50 range typical
  inTune: boolean;
  leftHanded?: boolean;
}

// Horizontal needle gauge, ±50 cents scale, green zone ±5 cents.
export function Gauge({ cents, inTune, leftHanded }: GaugeProps) {
  const clamped = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const pct = 50 + clamped; // 0..100
  const display = leftHanded ? 100 - pct : pct;

  return (
    <div className="relative w-full">
      {/* Cents scale */}
      <div className="mb-3 flex justify-between px-1 text-xs font-mono text-muted-foreground tabular-nums">
        <span>{leftHanded ? "+50" : "-50"}</span>
        <span>-25</span>
        <span className="text-primary">0</span>
        <span>+25</span>
        <span>{leftHanded ? "-50" : "+50"}</span>
      </div>

      <div className="relative h-24 w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card to-background shadow-inner">
        {/* Tick marks */}
        <div className="absolute inset-0 flex items-end justify-between px-4 pb-2">
          {Array.from({ length: 21 }).map((_, i) => {
            const isCenter = i === 10;
            const isMajor = i % 5 === 0;
            return (
              <div
                key={i}
                className={cn(
                  "w-px bg-muted-foreground/40",
                  isMajor ? "h-5" : "h-2.5",
                  isCenter && "w-0.5 bg-primary/80",
                )}
              />
            );
          })}
        </div>

        {/* Green in-tune zone (±5 cents = 10% of 100) */}
        <div
          className={cn(
            "absolute top-0 h-full transition-colors",
            inTune ? "bg-primary/25" : "bg-primary/10",
          )}
          style={{ left: "45%", width: "10%" }}
        />

        {/* Needle */}
        {cents !== null && (
          <div
            className={cn(
              "absolute top-1 h-[calc(100%-0.5rem)] w-1 rounded-full transition-all duration-75 ease-out",
              inTune
                ? "bg-primary shadow-[0_0_20px_rgba(0,255,140,0.7)]"
                : "bg-destructive shadow-[0_0_16px_rgba(255,60,60,0.55)]",
            )}
            style={{
              left: `calc(${display}% - 2px)`,
            }}
          />
        )}

        {/* Center notch */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div className="h-3 w-3 -translate-y-1 rotate-45 border-b border-r border-primary/80 bg-primary/60" />
        </div>
      </div>
    </div>
  );
}
