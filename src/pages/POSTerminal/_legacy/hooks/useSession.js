import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeSession, fetchCurrentSession, openSession } from '../store/slices/sessionSlice';

const useSession = () => {
    const dispatch = useDispatch();
    const session = useSelector((state) => state.session.session);
    const cashier = useSelector((state) => state.auth.cashier);
    const authOutletCode = useSelector((state) => state.auth.outletCode);

    // Cashiers carry a fixed outlet on their account. Owners/managers don't, so
    // fall back to the outlet of the currently open session (the one they chose
    // when opening the shift) — without it, the POS would fetch the menu for an
    // empty outlet and show nothing.
    const outletCode = authOutletCode || session?.outlet?.code || '';

    const isOpen = Boolean(session && session.status === 'open');

    const openSessionAction = useCallback(
        (payload) => dispatch(openSession(payload)),
        [dispatch]
    );

    const closeSessionAction = useCallback(
        (payload) => dispatch(closeSession(payload)),
        [dispatch]
    );

    const fetchCurrent = useCallback(() => dispatch(fetchCurrentSession()), [dispatch]);

    const outletName = session?.outlet?.name || null;
    const outletId = session?.outlet?._id || session?.outlet?.id || null;

    return {
        session,
        isOpen,
        openSession: openSessionAction,
        closeSession: closeSessionAction,
        fetchCurrentSession: fetchCurrent,
        cashier,
        outletCode,
        outletName,
        outletId,
    };
};

export default useSession;
