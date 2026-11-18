import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { isChunkLoadError, reloadApplicationForUpdate } from '../chunkLoadRecovery';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    void reloadApplicationForUpdate();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunkLoadFailed = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-6">
            {chunkLoadFailed
              ? 'A newer application version or a temporary connection problem prevented this page from loading. Reload to recover safely.'
              : 'An unexpected error occurred. Please reload the page. If the problem persists, contact your system administrator.'}
          </p>
          {this.state.error?.message && (
            <p className="text-xs font-mono text-red-400 bg-red-50 rounded-lg px-4 py-3 mb-6 text-left break-all">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {chunkLoadFailed ? 'Update and reload' : 'Reload page'}
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
