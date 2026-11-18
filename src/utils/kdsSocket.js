import { io } from 'socket.io-client';

let socket = null;

const socketUrl = () => process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || undefined;

export const getKdsSocket = () => {
  if (socket) return socket;
  socket = io(socketUrl(), {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // Resolve the token at every handshake so an automatic reconnect uses the
    // latest rotated access token instead of the one from the first page load.
    auth: (done) => done({ token: localStorage.getItem('accessToken') || '' }),
  });
  return socket;
};

export const joinKdsRoom = (outletId) => {
  if (!outletId) return () => {};
  const current = getKdsSocket();
  const join = () => current.emit('kds:join', { outletId });
  if (current.connected) join();
  current.on('connect', join);
  return () => {
    current.off('connect', join);
    if (current.connected) current.emit('kds:leave', { outletId });
  };
};
