import api from './api';
import * as offlineQueue from './offlineQueue';

export const listMine = async (params) => {
  const res = await api.get('/trips/me', { params });
  return res.data.data.trips;
};

const startRaw = async ({ tripId, ...body }) => {
  const res = await api.post(`/trips/${tripId}/start`, body);
  return res.data.data.trip;
};

const endRaw = async ({ tripId, ...body }) => {
  const res = await api.post(`/trips/${tripId}/end`, body);
  return res.data.data.trip;
};

offlineQueue.registerHandler('trip:start', startRaw);
offlineQueue.registerHandler('trip:end', endRaw);

// Queued rather than called directly — see offlineQueue.js. Resolves as
// soon as the action is queued (and flushed immediately if online), not
// when the server confirms it; the UI reflects the synced state once the
// queue drains (see useOfflineQueue + query invalidation in the screen).
export const startTrip = (tripId, body = {}) => offlineQueue.enqueue('trip:start', { tripId, ...body });
export const endTrip = (tripId, body = {}) => offlineQueue.enqueue('trip:end', { tripId, ...body });
