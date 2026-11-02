import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import './styles/global.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } } });
document.documentElement.dataset.theme = localStorage.getItem('ChatWave-theme') || localStorage.getItem('GoodBros-theme') || 'dark';
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><App /></BrowserRouter>
      <Toaster position="top-right" theme={document.documentElement.dataset.theme} richColors />
    </QueryClientProvider>
  </React.StrictMode>
);
