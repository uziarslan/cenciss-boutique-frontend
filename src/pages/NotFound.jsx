import { Link } from 'react-router';
import { Home, SearchX } from 'lucide-react';

const NotFound = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div className="text-center max-w-sm">
      <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-5">
        <SearchX size={32} className="text-indigo-500" />
      </div>
      <h1 className="text-5xl font-black text-gray-200 mb-2">404</h1>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Page not found</h2>
      <p className="text-sm text-gray-500 mb-7">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
      >
        <Home size={15} />
        Back to Dashboard
      </Link>
    </div>
  </div>
);

export default NotFound;
