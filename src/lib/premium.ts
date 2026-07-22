// Local premium unlock state. Wire Lemon Squeezy license check here later
// and cache the result so it survives offline.

const KEY = "weirdtune.premium.v1";

export interface PremiumState {
  unlocked: boolean;
  licenseKey?: string;
  verifiedAt?: number;
}

export function getPremium(): PremiumState {
  if (typeof window === "undefined") return { unlocked: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { unlocked: false };
    return JSON.parse(raw) as PremiumState;
  } catch {
    return { unlocked: false };
  }
}

export function setPremium(state: PremiumState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function unlockWithCode(code: string): boolean {
  // TODO: replace with Lemon Squeezy license API validation.
  // For now, master code so users can test; wire /api/public/license-verify later.
  const trimmed = code.trim().toUpperCase();
  if (trimmed === "WEIRDTUNE-DEV" || trimmed.startsWith("WT-")) {
    setPremium({ unlocked: true, licenseKey: trimmed, verifiedAt: Date.now() });
    return true;
  }
  return false;
}

export function lockPremium() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
