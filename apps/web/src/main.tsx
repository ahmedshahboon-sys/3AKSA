import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/readex-pro/400.css';
import '@fontsource/readex-pro/500.css';
import '@fontsource/readex-pro/600.css';
import '@fontsource/readex-pro/700.css';
import { normalizeBasePath } from '@3aksa/config';
import { App } from './App';
import { AppErrorBoundary } from './ErrorBoundary';
import { SessionProvider } from './session';
import { applyTheme, getInitialTheme } from './theme';
import { getLanguage,setLanguage } from './i18n';
import { installTelemetry } from './telemetry';
import './styles.css';
import './phase1.css';

const basePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH || '/3aksa/');
const routerBasename = basePath === '/' ? '/' : basePath.slice(0, -1);

applyTheme(getInitialTheme());
setLanguage(getLanguage());
installTelemetry();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // PWA registration must never prevent the app from loading.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <SessionProvider>
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
