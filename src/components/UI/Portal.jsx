import { createPortal } from 'react-dom';

// Renders children into <body> so that position:fixed overlays (modals, drawers)
// are anchored to the viewport and cannot be offset/clipped by a transformed,
// filtered, or `contain`-ed ancestor in the page layout. Use this for every
// full-screen overlay so they reliably cover the whole screen (including the
// sticky topbar).
const Portal = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export default Portal;
