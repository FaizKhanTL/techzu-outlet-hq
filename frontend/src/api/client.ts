const TOKEN_KEY = 'outlet-hq.token';

/** An error the API answered with: its status, stable code and a message meant for people. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Session storage: the token lives as long as the tab, and is not shared with other tabs or kept after closing.
let token: string | null = sessionStorage.getItem(TOKEN_KEY);
let onUnauthorized: () => void = () => undefined;

export const getToken = () => token;
export function setToken(value: string | null) {
  token = value;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Query;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(
      response.status,
      error?.code ?? 'NETWORK_ERROR',
      error?.message ?? `The server answered ${response.status}. Please try again.`,
      error?.details,
      error?.requestId,
    );
  }
  return payload as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
