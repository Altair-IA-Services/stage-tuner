export interface Preset {
  id: string;
  name: string;
  tuningId: string;
  leftHanded?: boolean;
  strobe?: boolean;
}

const KEY = "weirdtune.presets.v1";

export function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

export function savePresets(list: Preset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addPreset(p: Omit<Preset, "id">): Preset {
  const preset: Preset = { ...p, id: crypto.randomUUID() };
  const list = loadPresets();
  list.push(preset);
  savePresets(list);
  return preset;
}

export function deletePreset(id: string) {
  savePresets(loadPresets().filter((p) => p.id !== id));
}
