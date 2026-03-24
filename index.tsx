import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Always use createRoot. The SSG pre-rendered HTML inside #root serves
// search engine crawlers (they read the static HTML). For real users,
// React mounts fresh on top — this avoids hydration mismatches from
// Framer Motion, async data fetching (CSV), and scroll-based hooks.
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
