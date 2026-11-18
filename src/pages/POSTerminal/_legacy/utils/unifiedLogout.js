// Single sign-out path for the terminal. Clears both the management app's
// auth (main store + cookies + scheduled refresh) and the POS-scoped auth,
// then sends the user back to the unified /login page.
//
// Lives in _legacy/utils so legacy components can import it via the same
// relative paths they already use.
import mainStore from '../../../../store';
import { logoutUser } from '../../../../store/slices/authSlice';
import { logout as posLogout } from '../store/slices/authSlice';
import { clearSession } from '../store/slices/sessionSlice';
import { clearCart } from '../store/slices/cartSlice';
import { resetOrder } from '../store/slices/orderSlice';
import { clearMenu } from '../store/slices/menuSlice';

const unifiedLogout = async (posDispatch) => {
  try {
    await mainStore.dispatch(logoutUser());
  } catch {
    /* best-effort */
  }
  try {
    posDispatch(posLogout());
    // Drop the persisted shift so the next user doesn't briefly inherit it on
    // load (online revalidation would correct it, but clearing avoids the flash).
    posDispatch(clearSession());
    posDispatch(clearCart());
    posDispatch(resetOrder());
    posDispatch(clearMenu());
    localStorage.removeItem('pos_current_order');
  } catch {
    /* best-effort */
  }
  window.location.href = '/login';
};

export default unifiedLogout;
