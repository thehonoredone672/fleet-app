import { create } from 'zustand';
import * as secureStorage from '../services/secureStorage';

const ACCESS_TOKEN_KEY = 'fleet.accessToken';
const REFRESH_TOKEN_KEY = 'fleet.refreshToken';

// Plain Zustand state, no persist middleware — SecureStore (not
// AsyncStorage) is the durable store for tokens, and `restoreSession`
// re-derives everything (including a fresh `user`) from the API on
// launch rather than trusting a cached copy that might be stale relative
// to a role/isActive change made server-side.
const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isRestoring: true,

  isAuthenticated: () => Boolean(get().user),

  // Called once at app launch (RootNavigator). Reads persisted tokens and
  // validates them against the API — a token that looks present but is
  // expired/revoked/for a deactivated account resolves to "logged out"
  // rather than leaving the app in a half-authenticated state.
  restoreSession: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      secureStorage.getItem(ACCESS_TOKEN_KEY),
      secureStorage.getItem(REFRESH_TOKEN_KEY),
    ]);

    if (!accessToken || !refreshToken) {
      set({ isRestoring: false });
      return;
    }

    set({ accessToken, refreshToken });

    try {
      // Lazy import avoids a require-cycle: authService imports the api
      // client, which reads this store's tokens on every request.
      const authService = require('./../services/authService');
      const user = await authService.getMe();
      set({ user, isRestoring: false });
    } catch {
      await get().logout();
      set({ isRestoring: false });
    }
  },

  login: async (email, password) => {
    const authService = require('./../services/authService');
    const { user, accessToken, refreshToken } = await authService.login(email, password);

    await Promise.all([
      secureStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      secureStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);

    set({ user, accessToken, refreshToken });
    return user;
  },

  logout: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      const authService = require('./../services/authService');
      // Best-effort — the user is logged out locally regardless of
      // whether the revoke call itself succeeds (e.g. offline).
      await authService.logout(refreshToken).catch(() => {});
    }

    await Promise.all([secureStorage.removeItem(ACCESS_TOKEN_KEY), secureStorage.removeItem(REFRESH_TOKEN_KEY)]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  // Used by the axios response interceptor after a silent token refresh —
  // updates both the in-memory store and SecureStore without going
  // through the full login flow.
  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      secureStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      secureStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },
}));

export default useAuthStore;
