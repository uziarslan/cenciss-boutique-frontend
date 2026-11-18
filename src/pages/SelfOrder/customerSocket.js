// Singleton socket.io client for the customer self-order app.
// One connection per tab — used by both the menu page (table-occupancy
// updates) and the status page (per-order status updates).
import { io } from 'socket.io-client';

let socket = null;

const buildUrl = () => {
  // Explicit socket URL wins — use only when the socket lives on a
  // different host than the HTTP API.
  if (process.env.REACT_APP_SOCKET_URL) return process.env.REACT_APP_SOCKET_URL;
  // Default: piggyback on the same backend the HTTP client already uses.
  // Works in dev (http://localhost:4000), Heroku / prod (static backend URL),
  // and any other deployment without port hardcoding.
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  // Last resort: same-origin (assumes a reverse proxy forwards /socket.io).
  return undefined;
};

export const getCustomerSocket = () => {
  if (socket) return socket;
  socket = io(buildUrl(), {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  return socket;
};

/**
 * Subscribe to a per-table room. Re-joins on every reconnect so a network
 * blip doesn't silently drop the subscription.
 */
export const joinTableRoom = (tenantSlug, outletId, tableCode) => {
  if (!tenantSlug || !outletId || !tableCode) return () => {};
  const s = getCustomerSocket();
  const join = () => s.emit('qr:customer:joinTable', { tenantSlug, outletId, tableCode });
  if (s.connected) join();
  s.on('connect', join);
  return () => { s.off('connect', join); };
};

/**
 * Subscribe to a per-order room — used so the customer's tracking page
 * updates instantly when the cashier approves / declines / settles.
 */
export const joinOrderRoom = (tenantSlug, orderNumber) => {
  if (!tenantSlug || !orderNumber) return () => {};
  const s = getCustomerSocket();
  const join = () => s.emit('qr:customer:joinOrder', { tenantSlug, orderNumber });
  if (s.connected) join();
  s.on('connect', join);
  return () => { s.off('connect', join); };
};
