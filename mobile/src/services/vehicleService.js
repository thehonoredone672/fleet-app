import api from './api';

export const getMyVehicle = async () => {
  const res = await api.get('/vehicles/me');
  return res.data.data.vehicle;
};
