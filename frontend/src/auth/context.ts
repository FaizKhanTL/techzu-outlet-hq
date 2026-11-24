import { createContext, useContext } from 'react';
import type { User } from '../api/types';

export interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in user; only for pages behind a role guard. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser needs a signed-in user');
  return user;
}
