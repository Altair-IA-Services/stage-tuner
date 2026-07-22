import { useEffect, useRef, useState } from "react";
import { computeRms, detectPitchYIN, type YinResult } from "@/lib/yin";

export interface PitchState {
  freq: number | null;
  rms: number;
  probability: number;
  active: boolean;
  error: string | null;
  contextState: AudioContextState | "none";
  receivingAudio: boolean;
}

export function usePitchDetection(enabled: boolean): PitchState & {
  start: () => Promise<void>;
  stop: () => void;
} {
  const [state, setState] = useState<PitchState>({
    freq: null,
    rms: 0,
    probability: 0,
    active: false,
    error: null,
    contextState: "none",
    receivingAudio: false,
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const smoothRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const nonZeroRef = useRef<boolean>(false);
  const startingRef = useRef<boolean>(false);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => undefined);
    }
    ctxRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    smoothRef.current = null;
    nonZeroRef.current = false;
    startingRef.current = false;
    setState((s) => ({
      ...s,
      active: false,
      freq: null,
      rms: 0,
      contextState: "none",
      receivingAudio: false,
    }));
  };

  const start = async () => {
    // Prevent duplicate starts (e.g. React StrictMode double invocation).
    if (startingRef.current) return;
    if (ctxRef.current && ctxRef.current.state !== "closed" && streamRef.current) {
      return;
    }
    startingRef.current = true;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setState((s) => ({ ...s, error: "AudioContext non supporté par ce navigateur" }));
        startingRef.current = false;
        return;
      }

      // Always create a fresh context — never reuse a closed one.
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AC({ sampleRate: 44100 });
        ctxRef.current = ctx;
      }

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setState((s) => ({
          ...s,
          error: "API micro indisponible (contexte non sécurisé ?)",
          contextState: ctx!.state,
        }));
        startingRef.current = false;
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) {
        setState((s) => ({ ...s, error: "Aucune piste audio disponible" }));
        startingRef.current = false;
        return;
      }

      // Context may have been closed while awaiting gUM — recreate if so.
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctx = new AC({ sampleRate: 44100 });
        ctxRef.current = ctx;
      } else {
        ctx = ctxRef.current;
      }
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => undefined);
      }
      if (ctx.state === "closed") {
        startingRef.current = false;
        return;
      }

      const src = ctx.createMediaStreamSource(stream);
      sourceRef.current = src;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);

      startTsRef.current = performance.now();
      nonZeroRef.current = false;

      setState((s) => ({
        ...s,
        active: true,
        error: null,
        contextState: ctx!.state,
        receivingAudio: false,
      }));

      const loop = () => {
        const analyser = analyserRef.current;
        const buffer = bufferRef.current;
        const ctx = ctxRef.current;
        if (!analyser || !buffer || !ctx || ctx.state === "closed") return;
        analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>);
        const rawRms = computeRms(buffer);
        if (rawRms > 0.0005) nonZeroRef.current = true;

        if (
          !nonZeroRef.current &&
          performance.now() - startTsRef.current > 2000
        ) {
          setState((s) =>
            s.error
              ? s
              : {
                  ...s,
                  error:
                    ctx.state !== "running"
                      ? "Contexte audio bloqué — touchez à nouveau ACTIVER"
                      : "Micro silencieux — vérifiez l'entrée audio",
                  contextState: ctx.state,
                },
          );
        }

        const res: YinResult | null = detectPitchYIN(buffer, ctx.sampleRate, {
          threshold: 0.1,
          minFreq: 55,
          maxFreq: 1000,
          rmsThreshold: 0.015,
        });
        if (res && res.probability > 0.85) {
          const prev = smoothRef.current;
          const next = prev ? prev * 0.6 + res.frequency * 0.4 : res.frequency;
          smoothRef.current = next;
          setState((s) => ({
            ...s,
            freq: next,
            rms: rawRms,
            probability: res.probability,
            active: true,
            error: null,
            contextState: ctx.state,
            receivingAudio: true,
          }));
        } else {
          smoothRef.current = null;
          setState((s) => ({
            ...s,
            freq: null,
            rms: rawRms,
            probability: 0,
            contextState: ctx.state,
            receivingAudio: nonZeroRef.current,
          }));
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      startingRef.current = false;
    } catch (err) {
      startingRef.current = false;
      setState((s) => ({
        ...s,
        active: false,
        error:
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Micro refusé — autorisez-le dans les réglages du navigateur"
              : err.name === "NotFoundError"
                ? "Micro non détecté — aucun périphérique d'entrée"
                : err.message
            : "Micro indisponible",
      }));
    }
  };

  // Only stop when the caller explicitly disables the mic.
  // Do NOT stop on unmount — React StrictMode would tear down the context
  // immediately after start() in development, closing it before nodes connect.
  useEffect(() => {
    if (!enabled) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { ...state, start, stop };
}
