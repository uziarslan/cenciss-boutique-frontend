import api from './axios';

// Customer-facing loyalty endpoints used by the POS terminal.
// These all hit /api/loyalty/* and are gated server-side by the
// membershipRewards feature flag.

/** Fetch a member's balance + recent transactions. */
export const getMember = (id) =>
  api.get(`/api/loyalty/members/${encodeURIComponent(id)}`);

/** Issue a membership card to a customer. */
export const issueCard = (id, cardNumber) =>
  api.post(`/api/loyalty/members/${encodeURIComponent(id)}/issue-card`, cardNumber ? { cardNumber } : {});

/** Read the current loyalty config (earn rate, redemption rules). */
export const getLoyaltyConfig = () =>
  api.get('/api/loyalty/config');
