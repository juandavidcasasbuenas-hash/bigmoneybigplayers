// Private browsing and full storage quotas should not stop someone joining a game.
const fallback = new Map<string, string>();
export function readStored(key: string): string | null {
  try { return localStorage.getItem(key) ?? fallback.get(key) ?? null; }
  catch { return fallback.get(key) ?? null; }
}
export function writeStored(key: string, value: string): void {
  fallback.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Keep this session usable. */ }
}
export function removeStored(key: string): void {
  fallback.delete(key);
  try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}
