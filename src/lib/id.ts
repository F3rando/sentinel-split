/**
 * `crypto.randomUUID()` only works in a "secure context" (HTTPS or http://localhost).
 * On a phone using http://LAN_IP:8080 it throws — this breaks Zustand updates and the agent feed.
 */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* non-secure context (e.g. http://192.168.x.x) */
    }
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
