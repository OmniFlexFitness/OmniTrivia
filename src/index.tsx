import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

/**
 * Tell the boot guard in index.html that the bundle ran.
 *
 * Without this signal a page whose script never arrived — a cached index.html
 * pointing at the bundle of a build that has since been replaced — sits there
 * dark and empty with nothing to say for itself. The guard waits a few seconds
 * for this attribute and reloads against a fresh URL if it never appears.
 */
rootElement.setAttribute('data-booted', '1');

// A window left open all night — the projector, most of all — should still be
// able to recover from the *next* deploy, so the guard's one-shot flag is
// spent only on a load that actually failed.
try {
  window.sessionStorage.removeItem('omnitrivia:recovered-once');
} catch {
  // No session storage: the guard falls back to showing its message instead.
}

// The cache-busting parameter has done its job by the time anything renders,
// and it should not end up in the QR code or the link players are handed.
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('v')) {
    url.searchParams.delete('v');
    window.history.replaceState(null, '', url.toString());
  }
} catch {
  // A URL this browser will not parse is not worth failing to start over.
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
