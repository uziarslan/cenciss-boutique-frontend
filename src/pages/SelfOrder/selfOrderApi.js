// Public, unauthenticated API client for the QR-table self-order flow.
// Uses fetch directly — the main `axios` instance has auth interceptors that
// would inject a (non-existent) JWT and trip the public middleware.

// Base URL — REACT_APP_API_URL points at the backend. This MUST be set on
// production builds when the customer page is hosted on a different origin
// than the backend (e.g. pos.cenciss.com → restaurants-xxx.herokuapp.com).
// In local dev, CRA's proxy in package.json forwards relative /api/* calls
// to the backend, so an empty base also works there.
const base = process.env.REACT_APP_API_URL || '';

const handle = async (res) => {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!res.ok) {
    const err = new Error(body?.message || 'Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
};

export const fetchPublicMenu = (tenantSlug, outletCode, tableCode) =>
  fetch(`${base}/api/public/menu/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(outletCode)}/${encodeURIComponent(tableCode)}`)
    .then(handle);

export const placePublicOrder = (tenantSlug, outletCode, tableCode, payload) =>
  fetch(`${base}/api/public/orders/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(outletCode)}/${encodeURIComponent(tableCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(handle);

export const fetchPublicOrder = (tenantSlug, orderNumber) =>
  fetch(`${base}/api/public/orders/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(orderNumber)}`)
    .then(handle);

export const requestPublicBill = (tenantSlug, orderNumber, accessToken, billType) =>
  fetch(`${base}/api/public/orders/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(orderNumber)}/request-bill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, billType }),
  }).then(handle);
