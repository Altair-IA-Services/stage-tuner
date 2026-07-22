// YIN pitch detection.
// Reference: de Cheveigné & Kawahara (2002).
// Returns frequency in Hz or null if no confident pitch.

export interface YinResult {
  frequency: number;
  probability: number; // 1 - min(d')
  rms: number;
}

export function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i];
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

export function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number,
  options: {
    threshold?: number;
    minFreq?: number;
    maxFreq?: number;
    rmsThreshold?: number;
  } = {},
): YinResult | null {
  const threshold = options.threshold ?? 0.1;
  const minFreq = options.minFreq ?? 55; // A1
  const maxFreq = options.maxFreq ?? 1000;
  const rmsThreshold = options.rmsThreshold ?? 0.01;

  const rms = computeRms(buffer);
  if (rms < rmsThreshold) return null;

  const bufferSize = buffer.length;
  const halfSize = Math.floor(bufferSize / 2);
  const yinBuffer = new Float32Array(halfSize);

  // Step 1: difference function
  for (let tau = 0; tau < halfSize; tau++) {
    let sum = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    yinBuffer[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfSize; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] = (yinBuffer[tau] * tau) / (runningSum || 1);
  }

  // Bounds for tau from freq
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(halfSize - 1, Math.ceil(sampleRate / minFreq));

  // Step 3: absolute threshold — first minimum below threshold
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuffer[tau] < threshold) {
      // find local minimum
      while (tau + 1 <= tauMax && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Step 4: parabolic interpolation
  const x0 = tauEstimate > 0 ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 < halfSize ? tauEstimate + 1 : tauEstimate;
  let betterTau: number;
  if (x0 === tauEstimate) {
    betterTau =
      yinBuffer[tauEstimate] <= yinBuffer[x2] ? tauEstimate : x2;
  } else if (x2 === tauEstimate) {
    betterTau =
      yinBuffer[tauEstimate] <= yinBuffer[x0] ? tauEstimate : x0;
  } else {
    const s0 = yinBuffer[x0];
    const s1 = yinBuffer[tauEstimate];
    const s2 = yinBuffer[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    betterTau = denom !== 0 ? tauEstimate + (s2 - s0) / denom : tauEstimate;
  }

  const frequency = sampleRate / betterTau;
  if (frequency < minFreq || frequency > maxFreq) return null;

  return {
    frequency,
    probability: 1 - yinBuffer[tauEstimate],
    rms,
  };
}

// Convert frequency to cents relative to reference
export function centsFromFreq(freq: number, refFreq: number): number {
  return 1200 * Math.log2(freq / refFreq);
}
