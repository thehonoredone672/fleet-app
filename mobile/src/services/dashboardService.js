import api from './api';

export const getKpis = async () => {
  const res = await api.get('/dashboard/kpis');
  return res.data.data;
};
