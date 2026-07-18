// Simple localStorage-backed offline queue, standing in for the "本機暫存 /
// PENDING_UPLOAD / 網路恢復後自動補傳" branch of the activity & state diagrams.
// This is a real standalone web app (not a Claude.ai artifact), so
// localStorage is an appropriate and persistent choice here.

const KEY = "parking_inspection_offline_queue_v1";

export function loadQueue() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue) {
  window.localStorage.setItem(KEY, JSON.stringify(queue));
}

// Returns the queued item, or null if it could not be persisted. A full
// evidence photo is a base64 data-URL of several MB, and one payload can exceed
// the ~5 MB per-origin localStorage quota — in which case setItem throws
// QuotaExceededError. Callers MUST check for null and surface it, otherwise a
// completed offline inspection is silently lost (it's neither saved nor queued).
export function enqueue(payload) {
  const queue = loadQueue();
  const item = { queueId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, payload, queuedAt: new Date().toISOString() };
  queue.push(item);
  try {
    saveQueue(queue);
  } catch {
    return null;
  }
  return item;
}

export function removeFromQueue(queueId) {
  const queue = loadQueue().filter((item) => item.queueId !== queueId);
  saveQueue(queue);
}
