const MAX_PUBLIC_COOLDOWN_SECONDS = 300;

export function boundedCooldownUntil(seconds: number | null, now = Date.now()): number | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return now + Math.min(MAX_PUBLIC_COOLDOWN_SECONDS, Math.ceil(seconds)) * 1000;
}

export function getStoredCooldownUntil(key: string, now = Date.now()): number | null {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    if (!Number.isFinite(value) || value <= now) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function storeCooldownUntil(key: string, until: number | null): void {
  try {
    if (!until || until <= Date.now()) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, String(until));
  } catch {
    // Cooldown is an in-tab convenience; storage restrictions must not block review.
  }
}

export function clearStoredCooldown(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}