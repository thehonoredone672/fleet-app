import api from './api';

export const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  return res.data.data;
};

export const logout = async (refreshToken) => {
  await api.post('/auth/logout', { refreshToken });
};

export const getMe = async () => {
  const res = await api.get('/users/me');
  return res.data.data.user;
};
