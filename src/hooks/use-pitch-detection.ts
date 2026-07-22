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
  // Diagnostics
  byteAvg: number; // average deviation from 128 of getByteTimeDomainData (0..127)
  byteMax: number; // max deviation from 128 (0..127)
  trackEnabled: boolean | null;
  trackMuted: boolean | null;
  trackLabel: string | null;
  trackReadyState: MediaStreamTrackState | null;
  fftSize: number;
  bufferLength: number;
  sampleRate: number;
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
    byteAvg: 0,
    byteMax: 0,
    trackEnabled: null,
    trackMuted: null,
    trackLabel: null,
    trackReadyState: null,
    fftSize: 0,
    bufferLength: 0,
    sampleRate: 0,
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const byteBufferRef = useRef<Uint8Array | null>(null);
  const smoothRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const nonZeroRef = useRef<boolean>(false);
  const startingRef = useRef<boolean>(false);
  const lastDiagRef = useRef<number>(0);

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
    byteBufferRef.current = null;
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
      byteAvg: 0,
      byteMax: 0,
      trackEnabled: null,
      trackMuted: null,
      trackLabel: null,
      trackReadyState: null,
      fftSize: 0,
      bufferLength: 0,
      sampleRate: 0,
    }));
  };

  const start = async () => {
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
      // 4096 samples ≈ 93 ms @44.1 kHz — assez de cycles pour les cordes graves (~78 Hz).
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      // Connect source -> analyser only. DO NOT connect analyser to
      // ctx.destination — that would loop the mic back into speakers.
      src.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      byteBufferRef.current = new Uint8Array(analyser.fftSize);


      startTsRef.current = performance.now();
      nonZeroRef.current = false;

      const track = tracks[0];
      setState((s) => ({
        ...s,
        active: true,
        error: null,
        contextState: ctx!.state,
        receivingAudio: false,
        trackEnabled: track.enabled,
        trackMuted: track.muted,
        trackLabel: track.label || "(sans nom)",
        trackReadyState: track.readyState,
        fftSize: analyser.fftSize,
        bufferLength: analyser.fftSize,
        sampleRate: ctx!.sampleRate,
      }));

      const loop = () => {
        const analyser = analyserRef.current;
        const buffer = bufferRef.current;
        const byteBuffer = byteBufferRef.current;
        const ctx = ctxRef.current;
        const stream = streamRef.current;
        if (!analyser || !buffer || !byteBuffer || !ctx || ctx.state === "closed") return;
        analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>);
        analyser.getByteTimeDomainData(byteBuffer as Uint8Array<ArrayBuffer>);

        let byteSum = 0;
        let byteMax = 0;
        for (let i = 0; i < byteBuffer.length; i++) {
          const dev = Math.abs(byteBuffer[i] - 128);
          byteSum += dev;
          if (dev > byteMax) byteMax = dev;
        }
        const byteAvg = byteSum / byteBuffer.length;

        const rawRms = computeRms(buffer);
        if (rawRms > 0.0005 || byteMax > 1) nonZeroRef.current = true;

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
          rmsThreshold: 0.02,
        });


        // Throttle diagnostic track polling to ~10 Hz
        const now = performance.now();
        let trackPatch: Partial<PitchState> = {};
        if (now - lastDiagRef.current > 100) {
          lastDiagRef.current = now;
          const track = stream?.getAudioTracks()[0];
          if (track) {
            trackPatch = {
              trackEnabled: track.enabled,
              trackMuted: track.muted,
              trackReadyState: track.readyState,
            };
          }
        }

        if (res && res.probability > 0.85) {
          const prev = smoothRef.current;
          const next = prev ? prev * 0.6 + res.frequency * 0.4 : res.frequency;
          smoothRef.current = next;
          setState((s) => ({
            ...s,
            freq: next,
            rms: rawRms,
            byteAvg,
            byteMax,
            probability: res.probability,
            active: true,
            error: null,
            contextState: ctx.state,
            receivingAudio: true,
            ...trackPatch,
          }));
        } else {
          smoothRef.current = null;
          setState((s) => ({
            ...s,
            freq: null,
            rms: rawRms,
            byteAvg,
            byteMax,
            probability: 0,
            contextState: ctx.state,
            receivingAudio: nonZeroRef.current,
            ...trackPatch,
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

  useEffect(() => {
    if (!enabled) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { ...state, start, stop };
}
