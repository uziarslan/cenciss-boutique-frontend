// Singleton socket.io client for the authenticated MAIN app (not the POS/QR
// client, which has its own socket in pages/POSTerminal). Used for live
// operational events such as Store↔Kitchen stock transfers.
//
// Auth: the app JWT (`accessToken`) is sent in the socket HANDSHAKE. The server
// verifies it and derives the tenant itself, then scopes the `ops:<tenantSlug>`
// room to that verified tenant — the client never asserts its own tenant, so it
// can't subscribe to another tenant's events.
import { io } from 'socket.io-client';

let socket = null;

const buildUrl = () => process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || undefined;

export const getOpsSocket = () => {
  if (socket) return socket;
  socket = io(buildUrl(), {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // Function form → re-reads the (possibly refreshed) token on every
    // (re)connect handshake.
    auth: (cb) => cb({ token: localStorage.getItem('accessToken') || null }),
  });
  return socket;
};

/**
 * Join the current user's tenant ops room (server derives the tenant from the
 * handshake token). Re-joins on every reconnect. Returns a cleanup fn.
 */
export const joinOpsRoom = () => {
  const s = getOpsSocket();
  const join = () => s.emit('ops:join');
  if (s.connected) join();
  s.on('connect', join);
  return () => { s.off('connect', join); };
};

/**
 * Tear the socket down on logout so a subsequent login in the same tab opens a
 * fresh handshake with the new token (and a clean room membership) rather than
 * reusing a socket still joined to the previous tenant's room.
 */
export const disconnectOpsSocket = () => {
  if (socket) {
    try { socket.disconnect(); } catch { /* noop */ }
    socket = null;
  }
};
