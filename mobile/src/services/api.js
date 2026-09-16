import axios from 'axios';
import { API_BASE_URL } from '../constants/config';
import useAuthStore from '../store/authStore';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

// A separate, interceptor-free instance for the refresh call itself —
// using `api` (with its response interceptor below) to refresh would
// recurse back into the same 401-handling logic if the refresh call ever
// itself returned a 401.
const refreshClient = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise = null;

// On a 401, attempt exactly one silent refresh-and-retry per failing
// request. Concurrent 401s share a single in-flight refresh call
// (`refreshPromise`) instead of each firing their own — otherwise a
// screen that fires several requests at once when a token just expired
// would race multiple refresh calls against the same (single-use,
// rotating) refresh token.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = config?.url?.startsWith('/auth/');

    if (response?.status !== 401 || isAuthRoute || config._retried) {
      throw error;
    }

    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {
      throw error;
    }

    config._retried = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshClient
          .post('/auth/refresh', { refreshToken })
          .then((res) => res.data.data)
          .finally(() => {
            refreshPromise = null;
          });
      }

      const { accessToken, refreshToken: newRefreshToken } = await refreshPromise;
      await useAuthStore.getState().setTokens(accessToken, newRefreshToken);

      config.headers.Authorization = `Bearer ${accessToken}`;
      return api.request(config);
    } catch (refreshError) {
      // The refresh token itself is invalid/expired/revoked — there's no
      // way to recover this session, so log out locally and let the
      // original error propagate (RootNavigator redirects to Login once
      // the store's `user` clears).
      await useAuthStore.getState().logout();
      throw refreshError;
    }
  }
);

export default api;
