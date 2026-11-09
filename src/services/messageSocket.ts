import { AppState } from 'react-native';
import socketIo, { type Socket } from 'socket.io-client/dist/socket.io.js';
import { API_ORIGIN } from './api';

const io = socketIo.io || socketIo;

let socket: Socket | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let currentToken = '';

function stopPresenceTracking() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
}

function syncPresence(activeSocket: Socket, active: boolean) {
  activeSocket.emit('presence:active', active);
  if (active) activeSocket.emit('presence:heartbeat');
}

function startPresenceTracking(activeSocket: Socket) {
  stopPresenceTracking();
  const sync = () => syncPresence(activeSocket, AppState.currentState === 'active');
  activeSocket.on('connect', sync);
  appStateSubscription = AppState.addEventListener('change', (state) => syncPresence(activeSocket, state === 'active'));
  presenceTimer = setInterval(() => {
    if (AppState.currentState === 'active' && activeSocket.connected) activeSocket.emit('presence:heartbeat');
  }, 10000);
  sync();
}

export function getMessageSocket(accessToken: string) {
  if (!accessToken) return null;
  if (!socket || currentToken !== accessToken) {
    disconnectMessageSocket();
    currentToken = accessToken;
    socket = io(API_ORIGIN, {
      auth: { token: accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });
    startPresenceTracking(socket);
  } else if (!socket.connected) {
    socket.auth = { token: accessToken };
    socket.connect();
  }
  return socket;
}

export function disconnectMessageSocket() {
  stopPresenceTracking();
  socket?.disconnect();
  socket = null;
  currentToken = '';
}
