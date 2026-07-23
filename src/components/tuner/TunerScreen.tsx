import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Save, Share2, Volume2, Trash2, X, Play, Square } from "lucide-react";
import { usePitchDetection } from "@/hooks/use-pitch-detection";
import { TUNINGS, getTuning } from "@/lib/tunings";
import { freqToChromatic, noteFromMidi } from "@/lib/chromatic";
import { ArcMeter } from "./ArcMeter";
import { playNote, stopNote, playFootswitch } from "@/lib/tone";
import {
  loadPresets,
  addPreset,
  deletePreset,
  type Preset,
} from "@/lib/presets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const IN_TUNE_CENTS = 5;
// Very low absolute floor — the hook applies an adaptive gate on top of this,
// so a light pluck on a thin treble string is still recognized as "signal".
const NOISE_GATE_RMS = 0.0015;
const SUSTAIN_MS = 1800;
const STABILITY_MS = 180;
const HISTORY_MS = 400;
const HISTORY_MAX = 8;

// Knob configs (id must match a tuning id).
const KNOBS: { id: string; label: string; angle: number; big?: boolean }[] = [
  { id: "eb", label: "Eb", angle: -30 },
  { id: "standard", label: "E", angle: 0, big: true },
  { id: "drop-csharp", label: "C#", angle: -90 },
];

export function TunerScreen() {
  const [tuningId, setTuningId] = useState<string>("standard");
  const [micOn, setMicOn] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [showStrings, setShowStrings] = useState(false);
  const [pressed, setPressed] = useState(false);

  const tuning = useMemo(() => getTuning(tuningId), [tuningId]);
  const pitch = usePitchDetection(micOn);

  useEffect(() => {
    setPresets(loadPresets());
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t && TUNINGS.some((x) => x.id === t)) setTuningId(t);
  }, []);

  const historyRef = useRef<{ midi: number; t: number }[]>([]);
  const pendingRef = useRef<{ midi: number; since: number } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const [displayMidi, setDisplayMidi] = useState<number | null>(null);

  useEffect(() => {
    const hasSignal = pitch.freq !== null && pitch.rms >= NOISE_GATE_RMS;
    const now = performance.now();

    if (!hasSignal) {
      if (displayMidi !== null && silenceTimerRef.current === null) {
        silenceTimerRef.current = window.setTimeout(() => {
          historyRef.current = [];
          pendingRef.current = null;
          silenceTimerRef.current = null;
          setDisplayMidi(null);
        }, SUSTAIN_MS);
      }
      return;
    }

    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const midi = freqToChromatic(pitch.freq!).note.midi;
    const hist = historyRef.current;
    hist.push({ midi, t: now });
    while (hist.length > 0 && (now - hist[0].t > HISTORY_MS || hist.length > HISTORY_MAX)) {
      hist.shift();
    }
    const counts = new Map<number, number>();
    for (const h of hist) counts.set(h.midi, (counts.get(h.midi) ?? 0) + 1);
    let majority = midi;
    let best = 0;
    for (const [m, c] of counts) {
      if (c > best) {
        best = c;
        majority = m;
      }
    }
    if (displayMidi === null) {
      setDisplayMidi(majority);
      pendingRef.current = null;
      return;
    }
    if (majority === displayMidi) {
      pendingRef.current = null;
      return;
    }
    if (!pendingRef.current || pendingRef.current.midi !== majority) {
      pendingRef.current = { midi: majority, since: now };
    } else if (now - pendingRef.current.since >= STABILITY_MS) {
      setDisplayMidi(majority);
      pendingRef.current = null;
    }
  }, [pitch.freq, pitch.rms, displayMidi]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const chroma = displayMidi !== null ? noteFromMidi(displayMidi) : null;
  const liveCents =
    chroma && pitch.freq
      ? 1200 * Math.log2(pitch.freq / chroma.refFreq)
      : null;

  const smoothedCentsRef = useRef<number | null>(null);
  const [displayCents, setDisplayCents] = useState<number | null>(null);
  useEffect(() => {
    if (chroma === null) {
      smoothedCentsRef.current = null;
      setDisplayCents(null);
      return;
    }
    if (liveCents === null) return;
    const prev = smoothedCentsRef.current;
    const alpha = 0.25;
    const next = prev === null ? liveCents : prev + alpha * (liveCents - prev);
    smoothedCentsRef.current = next;
    setDisplayCents(next);
  }, [liveCents, chroma]);

  const cents = displayCents;
  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_CENTS;

  const expectedIndex = useMemo(() => {
    if (displayMidi === null) return -1;
    let bestI = -1;
    let bestDiff = Infinity;
    tuning.notes.forEach((n, i) => {
      const nMidi = Math.round(69 + 12 * Math.log2(n.freq / 440));
      const d = Math.abs(nMidi - displayMidi);
      if (d < bestDiff) {
        bestDiff = d;
        bestI = i;
      }
    });
    return bestDiff <= 1 ? bestI : -1;
  }, [displayMidi, tuning]);

  const handleFootswitch = () => {
    playFootswitch();
    if (navigator.vibrate) navigator.vibrate(15);
    if (micOn) {
      pitch.stop();
      setMicOn(false);
    } else {
      void pitch.start();
      setMicOn(true);
    }
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", tuningId);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Lien copié");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const handleSavePreset = () => {
    const name = prompt("Nom du preset");
    if (!name) return;
    addPreset({ name, tuningId });
    setPresets(loadPresets());
    toast.success("Preset enregistré");
  };

  return (
    <div className="min-h-screen w-full bg-[#0b0407] flex items-start justify-center px-3 py-6 sm:py-10">
      {/* PEDAL BODY */}
      <div
        className="relative w-full max-w-[420px] rounded-[36px] px-6 pt-6 pb-8 select-none"
        style={{
          background:
            "linear-gradient(160deg, #C22440 0%, #A31E37 45%, #7A0E24 100%)",
          boxShadow:
            "0 30px 60px -20px rgba(0,0,0,0.7), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -6px 24px rgba(0,0,0,0.45), 0 0 0 2px rgba(0,0,0,0.4)",
        }}
      >
        {/* Corner screws */}
        {[
          "top-3 left-3",
          "top-3 right-3",
          "bottom-3 left-3",
          "bottom-3 right-3",
        ].map((pos) => (
          <div
            key={pos}
            className={cn(
              "absolute h-3 w-3 rounded-full",
              pos,
            )}
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #4a4a4a, #1a1a1a 70%)",
              boxShadow:
                "inset 0 0 0 1px rgba(0,0,0,0.6), 0 1px 1px rgba(255,255,255,0.15)",
            }}
          >
            <div
              className="absolute inset-x-[2px] top-1/2 h-[1px] -translate-y-1/2 bg-black/70"
              style={{ transform: "translateY(-50%) rotate(35deg)" }}
            />
          </div>
        ))}

        {/* Logo */}
        <div className="text-center">
          <div
            className="leading-none"
            style={{
              fontFamily: '"Metal Mania", cursive',
              color: "#FFE9B3",
              fontSize: "2.4rem",
              textShadow:
                "0 1px 0 rgba(0,0,0,0.5), 0 0 12px rgba(255,209,102,0.35)",
              letterSpacing: "0.02em",
            }}
          >
            WeirdTuner
          </div>
          <svg
            viewBox="0 0 220 10"
            className="mx-auto mt-1 h-2 w-40"
            aria-hidden
          >
            <path
              d="M2 5 Q 20 0, 40 5 T 80 5 T 120 5 T 160 5 T 200 5 T 218 5"
              fill="none"
              stroke="#FFE9B3"
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.85}
            />
          </svg>
        </div>

        {/* Arc VU meter */}
        <div className="mt-5">
          <ArcMeter cents={cents} inTune={inTune} />
        </div>

        {/* LCD display */}
        <div
          className="mt-4 rounded-xl px-4 py-3"
          style={{
            background:
              "linear-gradient(180deg, #1a0509 0%, #2B0A12 100%)",
            boxShadow:
              "inset 0 3px 8px rgba(0,0,0,0.8), 0 0 0 2px rgba(0,0,0,0.5), 0 0 0 4px rgba(255,233,179,0.15)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div
              className="font-display font-bold uppercase leading-none tabular-nums"
              style={{
                fontSize: "4.5rem",
                color: chroma
                  ? inTune
                    ? "#3DDC84"
                    : "#FF4D4D"
                  : "#FFD166",
                textShadow: chroma
                  ? inTune
                    ? "0 0 22px #3DDC84"
                    : "0 0 18px #FF4D4D"
                  : "0 0 12px rgba(255,209,102,0.4)",
                fontFamily: '"Oswald", "Barlow Condensed", sans-serif',
                minWidth: "5rem",
              }}
            >
              {chroma ? chroma.name : "—"}
            </div>
            <div className="text-right">
              <div
                className="font-mono text-2xl tabular-nums"
                style={{
                  color: chroma
                    ? inTune
                      ? "#3DDC84"
                      : "#FF4D4D"
                    : "#FFD166",
                }}
              >
                {cents !== null
                  ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}`
                  : "--"}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#FFE9B3]/50">
                cents
              </div>
              {chroma && (
                <div className="mt-1 font-mono text-[10px] text-[#FFE9B3]/60 tabular-nums">
                  {chroma.fullName}
                </div>
              )}
            </div>
          </div>
          {pitch.error && (
            <div className="mt-2 font-mono text-[10px] text-[#FF4D4D]/90">
              {pitch.error}
            </div>
          )}
        </div>

        {/* Knobs */}
        <div className="mt-8 flex items-end justify-around">
          {KNOBS.map((k) => {
            const selected = tuningId === k.id;
            const size = k.big ? 90 : 68;
            return (
              <button
                key={k.id}
                onClick={() => setTuningId(k.id)}
                className="flex flex-col items-center gap-2 focus:outline-none"
                aria-label={`Accordage ${k.label}`}
              >
                <div
                  className="relative rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: selected
                      ? "radial-gradient(circle at 35% 30%, #FFE9B3, #FFD166 55%, #b8892a 100%)"
                      : "radial-gradient(circle at 35% 30%, #3a3a3a, #1a1a1a 70%, #0a0a0a 100%)",
                    boxShadow: selected
                      ? "inset 0 -3px 6px rgba(0,0,0,0.4), 0 3px 8px rgba(0,0,0,0.6), 0 0 20px rgba(255,209,102,0.45)"
                      : "inset 0 -3px 6px rgba(0,0,0,0.7), 0 3px 8px rgba(0,0,0,0.7)",
                    transition: "transform 300ms ease, box-shadow 300ms ease",
                    transform: `rotate(${k.angle}deg)`,
                  }}
                >
                  {/* Indicator line */}
                  <div
                    className="absolute left-1/2 top-1 h-[30%] w-[3px] -translate-x-1/2 rounded-full"
                    style={{
                      background: selected ? "#2B0A12" : "#FFE9B3",
                      boxShadow: selected
                        ? "none"
                        : "0 0 6px rgba(255,233,179,0.6)",
                    }}
                  />
                  {/* Center cap */}
                  <div
                    className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background: selected ? "#7A0E24" : "#2a2a2a",
                    }}
                  />
                </div>
                <span
                  className="font-display text-sm font-bold uppercase tracking-widest"
                  style={{
                    color: selected ? "#FFE9B3" : "#FFE9B3aa",
                    textShadow: selected
                      ? "0 0 8px rgba(255,233,179,0.6)"
                      : "none",
                  }}
                >
                  {k.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footswitch */}
        <div className="mt-8 flex justify-center">
          <button
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onClick={handleFootswitch}
            className="relative flex h-24 w-24 items-center justify-center rounded-full focus:outline-none"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, #FFE9B3, #FFD166 45%, #a3781f 100%)",
              boxShadow: pressed
                ? "inset 0 6px 14px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)"
                : "0 8px 18px rgba(0,0,0,0.55), inset 0 -6px 12px rgba(0,0,0,0.35), inset 0 3px 4px rgba(255,255,255,0.4)",
              transform: pressed ? "translateY(3px)" : "translateY(0)",
              transition: "transform 90ms ease, box-shadow 90ms ease",
            }}
            aria-label={micOn ? "Couper le micro" : "Activer le micro"}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: micOn
                  ? "radial-gradient(circle at 50% 40%, #FF6b6b, #A31E37)"
                  : "radial-gradient(circle at 50% 40%, #4a1a24, #2B0A12)",
                boxShadow: micOn
                  ? "0 0 18px #FF4D4D, inset 0 2px 4px rgba(0,0,0,0.5)"
                  : "inset 0 2px 6px rgba(0,0,0,0.7)",
              }}
            >
              <Mic
                className="h-7 w-7"
                style={{ color: micOn ? "#FFE9B3" : "#FFD166cc" }}
              />
            </div>
          </button>
        </div>
        <div
          className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.35em]"
          style={{ color: micOn ? "#3DDC84" : "#FFE9B3aa" }}
        >
          {micOn ? "● On" : "○ Off"}
        </div>

        {/* Jack row */}
        <div className="mt-8 flex items-end justify-around">
          <JackButton
            icon={<Save className="h-4 w-4" />}
            label="Presets"
            onClick={() => setShowPresets(true)}
          />
          <JackButton
            icon={<Share2 className="h-4 w-4" />}
            label="Partager"
            onClick={handleShare}
          />
          <JackButton
            icon={<Volume2 className="h-4 w-4" />}
            label="Cordes"
            onClick={() => setShowStrings(true)}
          />
        </div>
      </div>

      {/* Strings modal */}
      {showStrings && (
        <Modal onClose={() => { stopNote(); setShowStrings(false); }} title="Écoute des cordes">
          <div className="grid grid-cols-3 gap-2">
            {tuning.notes.map((n, i) => {
              const isExpected = i === expectedIndex;
              return (
                <button
                  key={i}
                  onClick={() => playNote(n.freq)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border py-3 transition-colors",
                    isExpected
                      ? "border-[#FFD166] bg-[#FFD166]/15 text-[#FFE9B3]"
                      : "border-[#FFE9B3]/20 bg-[#2B0A12] text-[#FFE9B3]/80 hover:border-[#FFD166]/60",
                  )}
                >
                  <Play className="mb-1 h-3 w-3 opacity-70" />
                  <span className="font-display text-2xl font-bold leading-none">
                    {n.displayName}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={stopNote}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#FFE9B3]/20 bg-[#2B0A12] py-2 font-mono text-xs text-[#FFE9B3]/80"
          >
            <Square className="h-3 w-3" /> Stop
          </button>
        </Modal>
      )}

      {/* Presets modal */}
      {showPresets && (
        <Modal onClose={() => setShowPresets(false)} title="Presets">
          <button
            onClick={handleSavePreset}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFD166] py-2 font-display text-sm font-bold text-[#2B0A12]"
          >
            <Save className="h-4 w-4" /> Enregistrer l'accordage courant
          </button>
          {presets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#FFE9B3]/20 p-4 text-center font-mono text-xs text-[#FFE9B3]/60">
              Aucun preset
            </div>
          ) : (
            <ul className="space-y-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-[#FFE9B3]/15 bg-[#2B0A12] px-3 py-2"
                >
                  <button
                    onClick={() => {
                      setTuningId(p.tuningId);
                      setShowPresets(false);
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="font-display text-sm font-bold text-[#FFE9B3]">
                      {p.name}
                    </div>
                    <div className="font-mono text-[10px] text-[#FFE9B3]/50">
                      {getTuning(p.tuningId).name}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      deletePreset(p.id);
                      setPresets(loadPresets());
                    }}
                    className="p-1 text-[#FFE9B3]/50 hover:text-[#FF4D4D]"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function JackButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 focus:outline-none"
    >
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #6a6a6a, #2a2a2a 65%, #0a0a0a 100%)",
          boxShadow:
            "inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle at 40% 35%, #1a1a1a, #000)",
            boxShadow: "inset 0 2px 3px rgba(0,0,0,0.9)",
            color: "#FFD166",
          }}
        >
          {icon}
        </div>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#FFE9B3]/70">
        {label}
      </span>
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#FFE9B3]/20 p-5 shadow-2xl"
        style={{
          background:
            "linear-gradient(160deg, #A31E37 0%, #7A0E24 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3
            className="font-display text-lg font-bold uppercase tracking-widest text-[#FFE9B3]"
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[#FFE9B3]/70 hover:text-[#FFE9B3]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
