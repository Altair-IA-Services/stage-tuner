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

// Short confirmation blip when note is in tune. Fires once, stops itself.
let lastConfirmAt = 0;
export function playConfirm() {
  const now = performance.now();
  if (now - lastConfirmAt < 600) return;
  lastConfirmAt = now;
  const c = getCtx();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 880;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}
