import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { SessionProvider } from './lib/session';
import { AccountProvider } from './lib/account';
import './app/theme';
import { registrarServiceWorker } from './lib/pwa';
import './styles.css';

registrarServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <AccountProvider>
        <RouterProvider router={router} />
      </AccountProvider>
    </SessionProvider>
  </React.StrictMode>,
);
