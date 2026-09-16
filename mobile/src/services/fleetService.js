import api from './api';

// Backs the Live Map's cold-load before the socket connects — see
// backend docs/gps-tracking.md and GET /api/v1/fleet/live.
export const getLiveFleet = async () => {
  const res = await api.get('/fleet/live');
  return res.data.data.vehicles;
};
