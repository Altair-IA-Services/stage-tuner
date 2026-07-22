// Full chromatic note detection, independent of any selected tuning.

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export interface ChromaticNote {
  midi: number;
  name: string; // "E♭"
  octave: number; // 2, 3, 4…
  fullName: string; // "E♭3"
  refFreq: number;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteFromMidi(midi: number): ChromaticNote {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    name,
    octave,
    fullName: `${name}${octave}`,
    refFreq: midiToFreq(midi),
  };
}

// Snap frequency to the nearest chromatic semitone (any octave).
export function freqToChromatic(freq: number): {
  note: ChromaticNote;
  cents: number;
} {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  const note = noteFromMidi(midi);
  const cents = 1200 * Math.log2(freq / note.refFreq);
  return { note, cents };
}
