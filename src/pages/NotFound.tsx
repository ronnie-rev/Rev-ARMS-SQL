import { Link } from 'react-router-dom';
export default function NotFound() {
  return <div className="panel p-10 max-w-lg mx-auto mt-16 text-center"><div className="display text-5xl muted">404</div><h2 className="display text-2xl mt-2">We can’t find that page</h2><p className="muted text-sm mt-2">The link may be old, or you may not have access. Use the search bar (⌘K) to jump anywhere.</p><div className="flex gap-2 justify-center mt-5"><Link className="btn btn-primary" to="/">Go to dashboard</Link><Link className="btn" to="/help">Get help</Link></div></div>;
}
