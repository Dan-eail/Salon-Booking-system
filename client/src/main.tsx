import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { I18nProvider } from './i18n';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import './index.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && n < 2 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <I18nProvider>
        <BrowserRouter>
          <AuthProvider><App /></AuthProvider>
        </BrowserRouter>
      </I18nProvider>
      <Toaster position="top-center" toastOptions={{ classNames: { toast: '!rounded-2xl !border-line !font-sans' } }} />
    </QueryClientProvider>
  </StrictMode>,
);
