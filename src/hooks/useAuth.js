import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { logoutUser } from '../store/slices/authSlice';

const useAuth = () => {
  const dispatch    = useDispatch();
  const navigate    = useNavigate();
  const { user, accessToken } = useSelector((state) => state.auth);

  const logout = async () => {
    await dispatch(logoutUser());
    navigate('/login', { replace: true });
  };

  return {
    user,
    isAuthenticated: Boolean(accessToken && user),
    role:            user?.role ?? null,
    logout,
  };
};

export default useAuth;
