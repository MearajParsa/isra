/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AuthProvider } from './app/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { StepUpModal } from './app/StepUpModal';
import { InstallPrompt } from './pwa/InstallPrompt';
import { UpdateToast } from './pwa/UpdateToast';
import { registerAppServiceWorker } from './pwa/register';

// QueryClient configuration respecting prompt specifications
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: (failureCount, error: unknown) => {
        // Only retry up to 2 times on network / 5xx errors for GETs
        const e = error as { status?: number };
        if (e?.status && e.status >= 400 && e.status < 500 && e.status !== 408) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false, // Never auto-retry mutations blindly
    },
  },
});

export default function App() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [refreshHandler, setRefreshHandler] = useState<(() => void) | null>(null);

  useEffect(() => {
    // Register PWA service worker
    registerAppServiceWorker((reload) => {
      setNeedRefresh(true);
      setRefreshHandler(() => reload);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          {/* Global Step-Up OTP Dialog */}
          <StepUpModal />
          {/* PWA In-App Install Prompt */}
          <InstallPrompt />
          {/* PWA Update Ready Toast */}
          <UpdateToast
            show={needRefresh}
            onUpdate={() => {
              if (refreshHandler) refreshHandler();
            }}
          />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
