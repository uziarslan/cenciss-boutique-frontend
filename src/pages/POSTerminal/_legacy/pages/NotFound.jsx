import { Link } from 'react-router';

const NotFound = () => (
  <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-6 text-center lg:min-h-[calc(100vh-7rem)]">
    <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-8 shadow-card">
      <h1 className="text-4xl font-extrabold text-surface-900">404</h1>
      <p className="mt-4 text-sm text-surface-600">Page not found. Use the POS navigation or return to the POS screen.</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Link
          to="/terminal/pos"
          className="btn-primary px-6 py-3"
        >
          Back to POS
        </Link>
        <Link
          to="/login"
          className="text-sm text-surface-400 transition hover:text-surface-600"
        >
          Return to Login
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;
