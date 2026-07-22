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

export function playNote(freq: number, duration = 2) {
  stopNote();
  const c = getCtx();
  const now = c.currentTime;

  const osc1 = c.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq;
  const osc2 = c.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const gain2 = c.createGain();
  gain2.gain.value = 0.08;

  osc1.connect(gain).connect(c.destination);
  osc2.connect(gain2).connect(gain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration + 0.05);
  osc2.stop(now + duration + 0.05);

  activeStopper = () => {
    try {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.04);
      osc1.stop(c.currentTime + 0.06);
      osc2.stop(c.currentTime + 0.06);
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

