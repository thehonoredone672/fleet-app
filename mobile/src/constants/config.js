// EXPO_PUBLIC_ vars are inlined into the JS bundle by Expo/Metro at build
// time — see .env.example. Falls back to localhost defaults so `npm start`
// works out of the box against a locally-running backend.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:4000';
