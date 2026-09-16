import { useEffect, useState } from 'react';
import * as offlineQueue from '../services/offlineQueue';

// Re-renders whenever the offline queue changes (an item added, or
// flushed after reconnect) — backs the "N pending sync" indicator.
export default function useOfflineQueue() {
  const [queue, setQueue] = useState(offlineQueue.getQueue());

  useEffect(() => offlineQueue.subscribe(setQueue), []);

  return queue;
}
