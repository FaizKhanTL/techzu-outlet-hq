import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { ErrorBox } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'HQ admin', email: 'hq@example.com' },
  { label: 'KLCC staff', email: 'klcc.staff@example.com' },
  { label: 'PJ staff', email: 'pj.staff@example.com' },
  { label: 'Penang staff', email: 'penang.staff@example.com' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card login" onSubmit={submit}>
        <h1>
          Outlet <strong>HQ</strong>
        </h1>
        <p className="muted">Sign in to the HQ console or your outlet&apos;s point of sale.</p>
        <ErrorBox error={error} />
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <details className="demo">
          <summary>Demo accounts</summary>
          <p className="muted">Password for every demo account: Password123!</p>
          <div className="demo-list">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="secondary"
                onClick={() => {
                  setEmail(account.email);
                  setPassword('Password123!');
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
        </details>
      </form>
    </div>
  );
}
