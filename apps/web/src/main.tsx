import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/readex-pro/400.css';
import '@fontsource/readex-pro/500.css';
import '@fontsource/readex-pro/600.css';
import '@fontsource/readex-pro/700.css';
import { normalizeBasePath } from '@3aksa/config';
import { App } from './App';
import './styles.css';

const basePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH || '/3aksa/');
const routerBasename = basePath === '/' ? '/' : basePath.slice(0, -1);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
