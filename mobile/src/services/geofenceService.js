import api from './api';

export const getGeofences = async () => {
  const res = await api.get('/geofences', { params: { isActive: true, limit: 100 } });
  return res.data.data.geofences;
};
