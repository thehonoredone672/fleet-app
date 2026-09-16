import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation at all (see Expo docs) — on
// web we fall back to localStorage purely so the app is smoke-testable in
// a browser during development. A real device/production build always
// uses the Keychain/Keystore-backed SecureStore. Both paths are wrapped
// in try/catch: SecureStore can throw on constrained platforms, and a
// throw here should never crash session restore on app launch.
const isWeb = Platform.OS === 'web';

export const getItem = async (key) => {
  try {
    if (isWeb) return window.localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

export const setItem = async (key, value) => {
  try {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Best-effort — a failed write shouldn't crash the caller; the user
    // simply won't have a persisted session next launch.
  }
};

export const removeItem = async (key) => {
  try {
    if (isWeb) {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Best-effort, same as setItem.
  }
};
