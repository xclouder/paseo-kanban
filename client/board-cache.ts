import { snapshotSchema, type Snapshot } from '../shared/model';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const key = (hostId: string) => `paseo-kanban:snapshot:v1:${hostId}`;
const maxAgeMs = 24 * 60 * 60 * 1000;
export function readCachedBoard(hostId: string, storage?: Storage, now = Date.now()): Snapshot | undefined {
  try {
    const raw = storage?.getItem(key(hostId));
    if (!raw) return;
    const snapshot = snapshotSchema.parse(JSON.parse(raw));
    const age = now - Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return;
    return snapshot;
  } catch { return; }
}
export function saveCachedBoard(hostId: string, snapshot: Snapshot, storage?: Storage) {
  try { storage?.setItem(key(hostId), JSON.stringify(snapshot)); }
  catch { /* Storage may be unavailable or full; the live board still works. */ }
}
export async function readWithTimeout<T>(read: () => Promise<T>, timeoutMs = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('读取看板超时，请检查 Paseo 连接后重试。')), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
