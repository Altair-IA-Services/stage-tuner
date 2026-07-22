import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Play, Square, Share2, Save, Lock, Trash2, Guitar } from "lucide-react";
import { usePitchDetection } from "@/hooks/use-pitch-detection";
import { TUNINGS, getTuning } from "@/lib/tunings";
import { freqToChromatic, noteFromMidi } from "@/lib/chromatic";
import { Gauge } from "./Gauge";
import { Strobe } from "./Strobe";
import { playNote, stopNote, playConfirm } from "@/lib/tone";
import { getPremium, unlockWithCode, lockPremium } from "@/lib/premium";
import {
  loadPresets,
  addPreset,
  deletePreset,
  type Preset,
} from "@/lib/presets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const IN_TUNE_CENTS = 5;
const NOISE_GATE_RMS = 0.02;
const STABILITY_MS = 180;
const HISTORY_MS = 400;
const HISTORY_MAX = 8;


export function TunerScreen() {
  const [tuningId, setTuningId] = useState<string>("standard");
  const [strobeMode, setStrobeMode] = useState(false);
  const [leftHanded, setLeftHanded] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [premium, setPremiumState] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");

  const tuning = useMemo(() => getTuning(tuningId), [tuningId]);
  const pitch = usePitchDetection(micOn);

  // Bootstrap from URL / storage
  useEffect(() => {
    setPremiumState(getPremium().unlocked);
    setPresets(loadPresets());
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t && TUNINGS.some((x) => x.id === t)) setTuningId(t);
    const lh = params.get("lh");
    if (lh === "1") setLeftHanded(true);
  }, []);

  // Enforce premium gating on tuning select
  useEffect(() => {
    if (tuning.premium && !premium) setTuningId("standard");
  }, [tuning, premium]);

  // Chromatic detection with median smoothing + minimum stability window.
  const historyRef = useRef<{ midi: number; t: number }[]>([]);
  const pendingRef = useRef<{ midi: number; since: number } | null>(null);
  const [displayMidi, setDisplayMidi] = useState<number | null>(null);

  

  useEffect(() => {
    // Noise gate: below threshold or no confident pitch → clear display.
    if (!pitch.freq || pitch.rms < NOISE_GATE_RMS) {
      historyRef.current = [];
      pendingRef.current = null;
      if (displayMidi !== null) setDisplayMidi(null);
      return;
    }
    const midi = freqToChromatic(pitch.freq).note.midi;
    const now = performance.now();
    const hist = historyRef.current;
    hist.push({ midi, t: now });
    while (hist.length > 0 && (now - hist[0].t > HISTORY_MS || hist.length > HISTORY_MAX)) {
      hist.shift();
    }
    // Majority / median across the window.
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

  const chroma = displayMidi !== null ? noteFromMidi(displayMidi) : null;
  const cents =
    chroma && pitch.freq
      ? 1200 * Math.log2(pitch.freq / chroma.refFreq)
      : null;
  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_CENTS;

  // Smoothed cents for the indicator (EMA — inertia like a real needle).
  const smoothedCentsRef = useRef<number | null>(null);
  const [displayCents, setDisplayCents] = useState<number | null>(null);
  useEffect(() => {
    if (cents === null) {
      smoothedCentsRef.current = null;
      setDisplayCents(null);
      return;
    }
    const prev = smoothedCentsRef.current;
    const alpha = 0.25;
    const next = prev === null ? cents : prev + alpha * (cents - prev);
    smoothedCentsRef.current = next;
    setDisplayCents(next);
  }, [cents]);

  // Expected string in the selected tuning (visual hint only).
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

  // Confirmation blip — fires once when transitioning to in-tune, then stops.
  useEffect(() => {
    if (inTune) playConfirm();
  }, [inTune]);



  const handleTuningClick = (id: string, isPremium: boolean) => {
    if (isPremium && !premium) {
      setShowUnlock(true);
      return;
    }
    setTuningId(id);
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", tuningId);
    if (leftHanded) url.searchParams.set("lh", "1");
    else url.searchParams.delete("lh");
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Lien copié");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const handleSavePreset = () => {
    const name = prompt("Nom du preset (ex: Ma Strat → Eb)");
    if (!name) return;
    if (!premium && presets.length >= 1) {
      toast.error("Preset illimité réservé au premium");
      return;
    }
    addPreset({ name, tuningId, leftHanded, strobe: strobeMode });
    setPresets(loadPresets());
    toast.success("Preset enregistré");
  };

  const handleLoadPreset = (p: Preset) => {
    setTuningId(p.tuningId);
    setLeftHanded(!!p.leftHanded);
    setStrobeMode(!!p.strobe);
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    setPresets(loadPresets());
  };

  const tryUnlock = () => {
    if (unlockWithCode(unlockCode)) {
      setPremiumState(true);
      setShowUnlock(false);
      setUnlockCode("");
      toast.success("Premium débloqué");
    } else {
      toast.error("Code invalide");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Guitar className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-black tracking-tight">
              WEIRD<span className="text-primary">TUNE</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {premium ? (
              <button
                onClick={() => {
                  lockPremium();
                  setPremiumState(false);
                  toast.info("Premium désactivé");
                }}
                className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-primary"
              >
                PRO
              </button>
            ) : (
              <button
                onClick={() => setShowUnlock(true)}
                className="rounded-full border border-border px-3 py-1 font-mono text-muted-foreground hover:text-foreground"
              >
                <Lock className="mr-1 inline h-3 w-3" />
                Débloquer
              </button>
            )}
          </div>
        </header>

        {/* Big note display */}
        <div className="mb-6 rounded-3xl border border-border/60 bg-card p-6 shadow-xl">
          <div className="mb-4 flex h-32 items-center justify-center sm:h-40">
            {chroma ? (
              <div className="text-center leading-none">
                <div
                  className={cn(
                    "font-display text-[7rem] font-black tabular-nums leading-none tracking-tighter transition-colors sm:text-[9rem]",
                    inTune ? "text-primary" : "text-destructive",
                  )}
                  style={{
                    textShadow: inTune
                      ? "0 0 40px oklch(0.85 0.22 145 / 0.55)"
                      : undefined,
                  }}
                >
                  {chroma.name}
                </div>
                <div className="mt-1 font-mono text-sm text-muted-foreground">
                  {chroma.fullName} · {chroma.refFreq.toFixed(2)} Hz
                </div>
              </div>
            ) : (
              <div className="text-center font-mono text-sm text-muted-foreground">
                {micOn
                  ? "Jouez une corde…"
                  : "Micro coupé — appuyez sur ACTIVER"}
              </div>
            )}

          </div>

          {strobeMode ? (
            <Strobe cents={cents} active={micOn && cents !== null} leftHanded={leftHanded} />
          ) : (
            <Gauge cents={displayCents} centerMidi={displayMidi} leftHanded={leftHanded} />
          )}


          <div className="mt-3 flex items-center justify-between font-mono text-sm">
            <span className="text-muted-foreground">
              {pitch.freq ? `${pitch.freq.toFixed(1)} Hz` : "—"}
            </span>
            <span
              className={cn(
                "tabular-nums",
                inTune ? "text-primary" : "text-muted-foreground",
              )}
            >
              {cents !== null
                ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)} cents`
                : "—"}
            </span>
          </div>
        </div>

        {/* Mic toggle */}
        <button
          onClick={() => {
            if (micOn) {
              pitch.stop();
              setMicOn(false);
            } else {
              // Kick off start() synchronously inside the user gesture so
              // AudioContext creation + resume() happen in the click frame.
              void pitch.start();
              setMicOn(true);
            }
          }}
          className={cn(
            "mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border py-5 font-display text-lg font-bold tracking-widest transition-all",
            micOn
              ? "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 shadow-[0_0_30px_oklch(0.85_0.22_145_/_0.25)]",
          )}
        >
          {micOn ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          {micOn ? "COUPER" : "ACTIVER LE MICRO"}
        </button>




        {pitch.error && (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {pitch.error}
          </div>
        )}

        {/* Tunings */}
        <section className="mb-6">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Accordage
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {TUNINGS.map((t) => {
              const locked = t.premium && !premium;
              const selected = t.id === tuningId;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTuningClick(t.id, t.premium)}
                  className={cn(
                    "relative rounded-xl border px-3 py-3 text-left transition-all",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  <div className="font-display text-sm font-bold">{t.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] opacity-70">
                    {t.notes.map((n) => n.displayName).join(" ")}
                  </div>
                  {locked && (
                    <Lock className="absolute right-2 top-2 h-3.5 w-3.5 opacity-70" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Reference tones */}
        <section className="mb-6">
          <h2 className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span>Écoute des cordes</span>
            {!premium && (
              <span className="text-[10px] normal-case opacity-70">
                <Lock className="mr-1 inline h-3 w-3" />
                Premium
              </span>
            )}
          </h2>
          <div className="grid grid-cols-6 gap-2">
            {tuning.notes.map((n, i) => {
              const isExpected = i === expectedIndex;
              return (
                <button
                  key={i}
                  onClick={() => playNote(n.freq)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border py-3 font-mono text-xs transition-colors",
                    isExpected
                      ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px_oklch(0.85_0.22_145_/_0.35)]"
                      : "border-border bg-card hover:border-primary/50 hover:text-primary",
                  )}
                >
                  <Play className="mb-1 h-3.5 w-3.5" />
                  {n.displayName}
                </button>
              );
            })}
          </div>

          <button
            onClick={stopNote}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            <Square className="h-3 w-3" /> Stop
          </button>
        </section>

        {/* Options */}
        <section className="mb-6 grid grid-cols-2 gap-2">
          <ToggleRow
            label="Mode strobe"
            active={strobeMode}
            premium={!premium}
            onClick={() => {
              if (!premium) {
                setShowUnlock(true);
                return;
              }
              setStrobeMode((v) => !v);
            }}
          />
          <ToggleRow
            label="Gaucher"
            active={leftHanded}
            onClick={() => setLeftHanded((v) => !v)}
          />
        </section>

        {/* Presets */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Presets
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs hover:text-primary"
              >
                <Share2 className="h-3 w-3" /> Partager
              </button>
              <button
                onClick={handleSavePreset}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs hover:text-primary"
              >
                <Save className="h-3 w-3" /> Enregistrer
              </button>
            </div>
          </div>
          {presets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center font-mono text-xs text-muted-foreground">
              Aucun preset enregistré
            </div>
          ) : (
            <ul className="space-y-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <button
                    onClick={() => handleLoadPreset(p)}
                    className="flex-1 text-left"
                  >
                    <div className="font-display text-sm font-bold">
                      {p.name}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {getTuning(p.tuningId).name}
                      {p.leftHanded ? " · gaucher" : ""}
                      {p.strobe ? " · strobe" : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeletePreset(p.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          YIN pitch detection · offline-ready
        </footer>
      </div>

      {/* Unlock modal */}
      {showUnlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => setShowUnlock(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-black">Débloquer Premium</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Accordages Eb & Drop C#, mode strobe, écoute des cordes, presets
              illimités. Achat unique.
            </p>
            <div className="mt-4 space-y-2">
              <input
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value)}
                placeholder="Code de licence"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={tryUnlock}
                className="w-full rounded-lg bg-primary py-2 font-display font-bold text-primary-foreground hover:opacity-90"
              >
                Valider
              </button>
              <p className="text-center text-[10px] text-muted-foreground">
                Astuce dev : code <code className="font-mono">WEIRDTUNE-DEV</code>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  active,
  premium,
  onClick,
}: {
  label: string;
  active: boolean;
  premium?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-xl border px-4 py-3 font-display text-sm font-bold transition-all",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-2">
        {premium && <Lock className="h-3.5 w-3.5 opacity-70" />}
        {label}
      </span>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          active ? "bg-primary shadow-[0_0_10px_currentColor]" : "bg-muted-foreground/30",
        )}
      />
    </button>
  );
}
