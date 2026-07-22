export interface TuningNote {
  name: string; // e.g. "E2"
  displayName: string; // "E"
  freq: number;
}

export interface Tuning {
  id: string;
  name: string;
  premium: boolean;
  notes: TuningNote[]; // low → high
}

export const TUNINGS: Tuning[] = [
  {
    id: "standard",
    name: "Standard",
    premium: false,
    notes: [
      { name: "E2", displayName: "E", freq: 82.41 },
      { name: "A2", displayName: "A", freq: 110.0 },
      { name: "D3", displayName: "D", freq: 146.83 },
      { name: "G3", displayName: "G", freq: 196.0 },
      { name: "B3", displayName: "B", freq: 246.94 },
      { name: "E4", displayName: "E", freq: 329.63 },
    ],
  },
  {
    id: "eb",
    name: "Eb (½ ton bas)",
    premium: true,
    notes: [
      { name: "Eb2", displayName: "E♭", freq: 77.78 },
      { name: "Ab2", displayName: "A♭", freq: 103.83 },
      { name: "Db3", displayName: "D♭", freq: 138.59 },
      { name: "Gb3", displayName: "G♭", freq: 185.0 },
      { name: "Bb3", displayName: "B♭", freq: 233.08 },
      { name: "Eb4", displayName: "E♭", freq: 311.13 },
    ],
  },
  {
    id: "drop-csharp",
    name: "Drop C#",
    premium: true,
    notes: [
      { name: "C#2", displayName: "C♯", freq: 69.3 },
      { name: "Ab2", displayName: "A♭", freq: 103.83 },
      { name: "Db3", displayName: "D♭", freq: 138.59 },
      { name: "Gb3", displayName: "G♭", freq: 185.0 },
      { name: "Bb3", displayName: "B♭", freq: 233.08 },
      { name: "Eb4", displayName: "E♭", freq: 311.13 },
    ],
  },
];

export function getTuning(id: string): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

// Find closest note in the tuning to a detected frequency
export function findClosestNote(
  freq: number,
  tuning: Tuning,
): { note: TuningNote; cents: number } | null {
  if (!tuning.notes.length) return null;
  let best: TuningNote = tuning.notes[0];
  let bestCents = Math.abs(1200 * Math.log2(freq / best.freq));
  for (const n of tuning.notes) {
    const c = Math.abs(1200 * Math.log2(freq / n.freq));
    if (c < bestCents) {
      best = n;
      bestCents = c;
    }
  }
  const signedCents = 1200 * Math.log2(freq / best.freq);
  return { note: best, cents: signedCents };
}
