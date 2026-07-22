import { cn } from "@/lib/utils";

interface ArcMeterProps {
  cents: number | null;
  inTune: boolean;
  leftHanded?: boolean;
}

const SEGMENTS = 21;
const CENTER = Math.floor(SEGMENTS / 2);
const TOL_HALF = 1; // ±1 segment ≈ ±5 cents (segments span ±50c)
const START_ANGLE = -110; // degrees, leftmost
const END_ANGLE = 110; // rightmost
const RADIUS_OUTER = 140;
const RADIUS_INNER = 108;
const CX = 160;
const CY = 158;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(i: number) {
  const step = (END_ANGLE - START_ANGLE) / SEGMENTS;
  const pad = 1.2;
  const a0 = START_ANGLE + i * step + pad;
  const a1 = START_ANGLE + (i + 1) * step - pad;
  const p0 = polar(CX, CY, RADIUS_OUTER, a0);
  const p1 = polar(CX, CY, RADIUS_OUTER, a1);
  const p2 = polar(CX, CY, RADIUS_INNER, a1);
  const p3 = polar(CX, CY, RADIUS_INNER, a0);
  return `M${p0.x},${p0.y} A${RADIUS_OUTER},${RADIUS_OUTER} 0 0 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${RADIUS_INNER},${RADIUS_INNER} 0 0 0 ${p3.x},${p3.y} Z`;
}

export function ArcMeter({ cents, inTune, leftHanded }: ArcMeterProps) {
  const hasSignal = cents !== null;
  const clamped = hasSignal ? Math.max(-50, Math.min(50, cents)) : 0;
  const oriented = leftHanded ? -clamped : clamped;
  const activeIdx = hasSignal
    ? Math.round(((oriented + 50) / 100) * (SEGMENTS - 1))
    : CENTER;

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 320 170"
        className="block w-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
        aria-hidden
      >
        {/* Recessed arc backing */}
        <path
          d={(() => {
            const p0 = polar(CX, CY, RADIUS_OUTER + 6, START_ANGLE - 3);
            const p1 = polar(CX, CY, RADIUS_OUTER + 6, END_ANGLE + 3);
            const p2 = polar(CX, CY, RADIUS_INNER - 6, END_ANGLE + 3);
            const p3 = polar(CX, CY, RADIUS_INNER - 6, START_ANGLE - 3);
            return `M${p0.x},${p0.y} A${RADIUS_OUTER + 6},${RADIUS_OUTER + 6} 0 0 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${RADIUS_INNER - 6},${RADIUS_INNER - 6} 0 0 0 ${p3.x},${p3.y} Z`;
          })()}
          fill="#1a0509"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={1}
        />
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const distFromCenter = i - CENTER;
          const distFromActive = i - activeIdx;
          const inTolBand = Math.abs(distFromCenter) <= TOL_HALF;
          const between =
            hasSignal &&
            ((distFromActive <= 0 && distFromCenter >= 0) ||
              (distFromActive >= 0 && distFromCenter <= 0));

          let fill = "#3a1119"; // dim
          let glow = "";
          if (inTolBand) {
            fill = hasSignal && inTune ? "#3DDC84" : "#1f7a48";
            if (hasSignal && inTune) glow = "url(#greenGlow)";
          }
          if (between) {
            if (inTune) {
              fill = "#3DDC84";
              glow = "url(#greenGlow)";
            } else {
              fill = "#FFD166";
              glow = "url(#goldGlow)";
            }
          }
          if (i === activeIdx && hasSignal) {
            fill = inTune ? "#3DDC84" : Math.abs(cents!) > 20 ? "#FF4D4D" : "#FFD166";
            glow = inTune ? "url(#greenGlow)" : "url(#goldGlow)";
          }
          return (
            <path
              key={i}
              d={segmentPath(i)}
              fill={fill}
              filter={glow || undefined}
              style={{ transition: "fill 90ms linear" }}
            />
          );
        })}
        <defs>
          <filter id="greenGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Tick center marker */}
        <line
          x1={CX}
          y1={CY - RADIUS_OUTER - 4}
          x2={CX}
          y2={CY - RADIUS_OUTER - 12}
          stroke="#FFE9B3"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 -bottom-1 text-center font-mono text-[10px] uppercase tracking-[0.3em]",
          hasSignal && inTune ? "text-[#3DDC84]" : "text-[#FFD166]/70",
        )}
      >
        {leftHanded ? "+  cents  −" : "−  cents  +"}
      </div>
    </div>
  );
}
