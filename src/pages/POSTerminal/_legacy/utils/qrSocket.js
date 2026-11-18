// Singleton socket.io client for the POS terminal's QR feature. One
// connection per tab, shared by the QR panel + header badge.
//
// Auth context:
//   - Cashier is JWT-protected on the API side, but socket rooms are
//     scoped per (tenantSlug, outletId) so any cashier with that combo
//     gets the events. The events themselves don't carry sensitive data
//     beyond what the cashier already sees in the QR panel.
import { io } from 'socket.io-client';

let socket = null;

// Decodes the POS JWT (no signature verify — that happens on the server)
// purely to recover tenantSlug client-side. The token always carries the
// slug because every API request needs it for tenant routing.
export const getPosTenantSlug = () => {
  try {
    const token = localStorage.getItem('pos_access_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.tenantSlug || null;
  } catch {
    return null;
  }
};

const buildUrl = () => {
  // Explicit socket URL wins — use only when the socket lives on a
  // different host than the HTTP API.
  if (process.env.REACT_APP_SOCKET_URL) return process.env.REACT_APP_SOCKET_URL;
  // Default: piggyback on the same backend the HTTP client already uses.
  // This works in dev (http://localhost:4000), Heroku / prod (the static
  // backend URL), and any other host configuration — no port hardcoding.
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  // Last resort: same-origin (assumes a reverse proxy forwards /socket.io).
  return undefined;
};

export const getQrSocket = () => {
  if (socket && socket.connected) return socket;
  if (socket) return socket; // connecting — return existing
  socket = io(buildUrl(), {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // Private staff-order rooms are authorized from this verified JWT on the
    // server. Public QR customer sockets may still connect without a token.
    // Resolve the token at every handshake so reconnects continue working
    // after the POS access token has rotated.
    auth: (done) => done({ token: localStorage.getItem('pos_access_token') || '' }),
  });
  return socket;
};

/**
 * Cashier joins the per-tenant + per-outlet QR room. Re-joins on every
 * reconnect so subscriptions survive network drops.
 */
export const joinCashierRoom = (tenantSlug, outletId) => {
  if (!tenantSlug || !outletId) return () => {};
  const s = getQrSocket();
  const join = () => s.emit('qr:cashier:join', { tenantSlug, outletId });
  if (s.connected) join();
  s.on('connect', join);
  return () => { s.off('connect', join); };
};

/**
 * Join the private staff-tablet order room. Only the outlet id is sent; the
 * server derives the tenant from the verified POS JWT in the socket handshake.
 */
export const joinOrderRoom = (outletId) => {
  if (!outletId) return () => {};
  const s = getQrSocket();
  const join = () => s.emit('orders:join', { outletId });
  if (s.connected) join();
  s.on('connect', join);
  return () => { s.off('connect', join); };
};
