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

export function enqueue(payload) {
  const queue = loadQueue();
  const item = { queueId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, payload, queuedAt: new Date().toISOString() };
  queue.push(item);
  saveQueue(queue);
  return item;
}

export function removeFromQueue(queueId) {
  const queue = loadQueue().filter((item) => item.queueId !== queueId);
  saveQueue(queue);
}
