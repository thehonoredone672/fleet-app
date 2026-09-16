import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants/config';

let socket = null;

// `transports: ['websocket']` skips socket.io's default long-polling
// upgrade handshake, which is unnecessary overhead on a mobile network
// and occasionally flaky inside React Native's networking layer.
export const connectSocket = (accessToken) => {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
