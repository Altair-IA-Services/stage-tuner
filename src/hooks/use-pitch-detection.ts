import { useEffect, useRef, useState } from "react";
import { detectPitchYIN, type YinResult } from "@/lib/yin";

export interface PitchState {
  freq: number | null;
  rms: number;
  probability: number;
  active: boolean;
  error: string | null;
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
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const smoothRef = useRef<number | null>(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    smoothRef.current = null;
    setState((s) => ({ ...s, active: false, freq: null }));
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC({ sampleRate: 44100 });
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);

      setState((s) => ({ ...s, active: true, error: null }));

      const loop = () => {
        const analyser = analyserRef.current;
        const buffer = bufferRef.current;
        const ctx = ctxRef.current;
        if (!analyser || !buffer || !ctx) return;
        analyser.getFloatTimeDomainData(buffer);
        const res: YinResult | null = detectPitchYIN(buffer, ctx.sampleRate, {
          threshold: 0.1,
          minFreq: 55,
          maxFreq: 1000,
          rmsThreshold: 0.015,
        });
        if (res && res.probability > 0.85) {
          // Smoothing to steady the needle
          const prev = smoothRef.current;
          const next = prev ? prev * 0.6 + res.frequency * 0.4 : res.frequency;
          smoothRef.current = next;
          setState({
            freq: next,
            rms: res.rms,
            probability: res.probability,
            active: true,
            error: null,
          });
        } else {
          smoothRef.current = null;
          setState((s) =>
            s.freq === null ? s : { ...s, freq: null, rms: res?.rms ?? 0 },
          );
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setState((s) => ({
        ...s,
        active: false,
        error: err instanceof Error ? err.message : "Micro indisponible",
      }));
    }
  };

  useEffect(() => {
    if (!enabled) stop();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { ...state, start, stop };
}
