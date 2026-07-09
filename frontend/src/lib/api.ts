import { supabase } from './supabase';

// Configurable for production (Vercel): set VITE_API_BASE_URL in the frontend env.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  if (!token) throw new Error('Not authenticated');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  
  if (!headers.has('Content-Type') && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || errData.error || response.statusText);
  }

  return response.json();
}

export const api = {
  getAccounts: () => fetchWithAuth('/portfolio/accounts'),
  getPositions: () => fetchWithAuth('/portfolio/positions'),
  getBalances: () => fetchWithAuth('/portfolio/balances'),
  getOrders: () => fetchWithAuth('/portfolio/orders'),
  getGrowth: () => fetchWithAuth('/portfolio/growth'),
  getDateRange: () => fetchWithAuth('/portfolio/date-range'),
  getTransactions: (accountHash?: string) => {
    const q = accountHash ? `?accountHash=${encodeURIComponent(accountHash)}` : '';
    return fetchWithAuth(`/portfolio/transactions${q}`);
  },
  getAuthUrl: () => fetchWithAuth('/schwab/auth-url'),
  triggerSync: () => fetchWithAuth('/schwab/sync', { method: 'POST', body: JSON.stringify({}) }),
  submitCallbackCode: (code: string) => fetchWithAuth('/schwab/callback', { method: 'POST', body: JSON.stringify({ code }) })
};
