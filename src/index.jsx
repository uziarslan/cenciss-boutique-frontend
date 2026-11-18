import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {
  clearOfflineServiceWorker,
  registerOfflineServiceWorker,
} from './serviceWorkerRegistration';
import { installChunkLoadRecovery } from './chunkLoadRecovery';

// Install this before rendering because the first route is also code-split.
installChunkLoadRecovery();

// Disable mouse-wheel value changes on focused number inputs across the app.
// Keyboard arrow keys still increment/decrement.
document.addEventListener(
  'wheel',
  (e) => {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number') {
      el.blur();
      e.preventDefault();
      setTimeout(() => el.focus({ preventScroll: true }), 0);
    }
  },
  { passive: false }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The HTML bootstrap watchdog uses this marker to distinguish a healthy app
// from an entry-module failure that React's error boundary cannot catch.
window.__CENCISS_APP_BOOTED__ = true;
try {
  sessionStorage.removeItem('cenciss:boot-recovery');
  const url = new URL(window.location.href);
  if (url.searchParams.has('__app_recovery')) {
    url.searchParams.delete('__app_recovery');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
} catch {
  // Recovery bookkeeping must never block normal application startup.
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Production uses the release-aware offline worker. Vite development must use
// its live module graph directly; production caching of stable /src URLs can
// otherwise leave localhost on an empty screen after a normal reload.
if (process.env.NODE_ENV === 'production') {
  registerOfflineServiceWorker();
} else {
  clearOfflineServiceWorker().catch((error) => {
    console.warn('Unable to clear the development service worker.', error);
  });
}
