import React from "react";
import ReactDOM from "react-dom/client";
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/jetbrains-mono/400.css';
import "@/index.css";
import App from "@/App";

// BUG-F14 fix: silence console.log/debug/info in production builds so that
// 94+ scattered `console.log` calls don't leak data (mappings, IDs, response
// payloads, stack traces with auth headers) on customer browsers. Errors
// and warnings remain visible because they are needed for runtime debugging.
if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
}

// Suppress ResizeObserver loop error (known Radix UI issue, not critical)
const resizeObserverErr = window.onerror;
window.onerror = (message, ...args) => {
  if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
    return true; // Suppress this specific error
  }
  return resizeObserverErr ? resizeObserverErr(message, ...args) : false;
};

// Also handle unhandled promise rejections for ResizeObserver
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('ResizeObserver loop')) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return true;
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope);
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000); // every hour
      })
      .catch((err) => console.log('[SW] Registration failed:', err));
  });
}
