import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="center-page">
      <h1>Page not found</h1>
      <p className="muted">The page you asked for does not exist.</p>
      <Link to="/">Go home</Link>
    </div>
  );
}
