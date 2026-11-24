import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type InitialEntry } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import type { User } from '../api/types';

export const staffUser: User = {
  id: 'user-1',
  email: 'klcc.staff@example.com',
  fullName: 'KLCC Staff',
  role: 'OUTLET_STAFF',
  outletId: 'outlet-1',
  currency: 'MYR',
};

/** Renders with a fresh query cache, a router and (optionally) a signed-in user. */
export function renderWithProviders(
  ui: ReactElement,
  {
    user = staffUser as User | null,
    route = '/' as InitialEntry,
    login = vi.fn() as AuthState['login'],
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const auth: AuthState = { user, loading: false, login, logout: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper }), queryClient, auth };
}

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Replaces fetch with a router of canned answers: `route(method, path)` returns [status, body]. Every call is kept
 * so a test can check what the app sent.
 */
export function fakeApi(
  route: (method: string, path: string, body: unknown) => [number, unknown?],
) {
  const calls: FakeCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      const path = url.pathname.replace(/^\/api\/v1/, '') + url.search;
      calls.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> });
      const [status, payload] = route(method, path, body);
      return new Response(payload === undefined ? null : JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}
