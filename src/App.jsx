import { BrowserRouter } from 'react-router';
import { Provider, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import store from './store';
import AppRoutes from './routes';
import ErrorBoundary from './components/ErrorBoundary';
import { getMe } from './api/userApi';
import { setUser } from './store/slices/authSlice';
import useFavicon from './hooks/useFavicon';

// Defined outside App so React never remounts it during StrictMode double-invoke
function AuthBootstrap() {
  const dispatch = useDispatch();
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMe();
        if (!cancelled && data?.user) dispatch(setUser(data.user));
      } catch {
        // Interceptor already handled redirect to /login on refresh failure.
        // Nothing to do here.
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch]);
  return null;
}

function App() {
  useFavicon();
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <AuthBootstrap />
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontSize: '0.875rem' },
            }}
          />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  );
}

export default App;
