// Simple pluck-like tone for reference playback.
let ctx: AudioContext | null = null;
let activeStopper: (() => void) | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function playNote(freq: number, duration = 2.5) {
  stopNote();
  const c = getCtx();
  const sr = c.sampleRate;
  const now = c.currentTime;

  // Karplus-Strong: pre-render into an AudioBuffer for performance.
  const totalSamples = Math.floor(sr * duration);
  const buffer = c.createBuffer(1, totalSamples, sr);
  const out = buffer.getChannelData(0);

  const N = Math.max(2, Math.floor(sr / freq));
  const delay = new Float32Array(N);
  // Initial excitation: white noise burst, slightly lowpassed for a warmer pluck.
  let prevNoise = 0;
  for (let i = 0; i < N; i++) {
    const n = Math.random() * 2 - 1;
    const s = (n + prevNoise) * 0.5;
    delay[i] = s;
    prevNoise = n;
  }

  const damping = 0.996; // energy loss per pass
  let idx = 0;
  for (let i = 0; i < totalSamples; i++) {
    const cur = delay[idx];
    const next = delay[(idx + 1) % N];
    // Lowpass (two-sample average) + damping — the classic KS loop filter.
    const filtered = 0.5 * (cur + next) * damping;
    out[i] = cur;
    delay[idx] = filtered;
    idx = (idx + 1) % N;
  }

  const source = c.createBufferSource();
  source.buffer = buffer;

  // Global tone-shaping lowpass to soften digital edge.
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4000;
  lp.Q.value = 0.7;

  // Amplitude envelope: quick attack, natural exponential decay.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.9, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(lp).connect(gain).connect(c.destination);
  source.start(now);
  source.stop(now + duration + 0.05);

  activeStopper = () => {
    try {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.04);
      source.stop(c.currentTime + 0.06);
    } catch {
      /* noop */
    }
    activeStopper = null;
  };
}


export function stopNote() {
  activeStopper?.();
}

// Kept as no-op to preserve import compatibility; no in-tune beeps.
export function playConfirm() {
  /* intentionally silent */
}

// Short mechanical footswitch click. Fires on mic toggle only.
export function playFootswitch() {
  try {
    const c = getCtx();
    const t = c.currentTime;
    // Noise burst
    const bufferSize = Math.floor(c.sampleRate * 0.04);
    const buf = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    noise.connect(hp).connect(g).connect(c.destination);
    noise.start(t);
    noise.stop(t + 0.06);

    // Low thump
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);
    const og = c.createGain();
    og.gain.setValueAtTime(0.25, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(og).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    /* noop */
  }
}

