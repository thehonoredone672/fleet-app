import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const STORAGE_KEY = 'fleet.offlineQueue';

// §19: queue trip start/end and fuel-record submissions while offline,
// flush automatically on reconnect, never double-submit. Deliberately a
// plain module (not a Zustand store) — it needs to run its flush logic
// from a NetInfo listener that exists independently of any mounted
// screen, and persists across app restarts via AsyncStorage (unlike
// auth tokens, this is bulk/structured data, so SecureStore — see
// docs/architecture.md's mobile notes — isn't the right tool here).
let queue = [];
let listeners = [];
let handlersByType = {};
let flushing = false;
let hydrated = false;

const notify = () => listeners.forEach((fn) => fn(queue));

const persist = () => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue)).catch(() => {});

const hydrate = async () => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    queue = raw ? JSON.parse(raw) : [];
    notify();
  } catch {
    queue = [];
  }
};

// Registered once per action type (trip:start, trip:end, fuel:create) by
// the services that know how to actually perform them — keeps this
// module generic instead of hardcoding API calls here.
export const registerHandler = (type, handler) => {
  handlersByType[type] = handler;
};

export const subscribe = (listener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

export const getQueue = () => queue;

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Adds an action and immediately attempts to flush (a no-op if offline —
// flush() below stops at the first network failure and leaves the item
// queued for the next connectivity change or app launch).
export const enqueue = async (type, payload) => {
  await hydrate();
  const item = { id: genId(), type, payload, createdAt: new Date().toISOString() };
  queue = [...queue, item];
  await persist();
  notify();
  flush();
  return item;
};

// A network-layer failure (no response at all) stops the flush — the
// remaining queue stays intact for the next attempt. A real API error
// (the server responded, just with a rejection) drops that one item —
// retrying an invalid request forever would never succeed, and a
// state-machine "already done" error (e.g. starting an already-started
// trip) is specifically treated as success, since that's exactly what a
// retried-after-lost-response submission looks like from the server's
// side — see docs/architecture.md#offline-sync.
export const flush = async () => {
  if (flushing) return;
  await hydrate();
  flushing = true;

  try {
    while (queue.length > 0) {
      const item = queue[0];
      const handler = handlersByType[item.type];

      if (!handler) {
        queue = queue.slice(1);
        await persist();
        notify();
        continue;
      }

      try {
        await handler(item.payload);
        queue = queue.slice(1);
        await persist();
        notify();
      } catch (err) {
        if (!err.response) {
          // No response reached us at all — genuinely offline/unreachable.
          // Stop here; NetInfo will trigger another flush on reconnect.
          break;
        }
        // Server responded — either it's already-done (state machine
        // finality error) or a real validation failure. Either way,
        // retrying the exact same payload won't produce a different
        // result, so drop it rather than loop forever.
        queue = queue.slice(1);
        await persist();
        notify();
      }
    }
  } finally {
    flushing = false;
  }
};

NetInfo.addEventListener((state) => {
  if (state.isConnected) flush();
});

hydrate();

export default { enqueue, flush, getQueue, subscribe, registerHandler };
