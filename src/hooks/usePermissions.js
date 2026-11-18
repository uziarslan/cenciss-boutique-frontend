import { useMemo, useCallback } from 'react';
import useAuth from './useAuth';
import { PERMISSIONS, hasEffectivePermission } from '../config/permissions';

// Hook that returns a helper to check effective permissions for the current user.
// user.permissions may be:
//   (a) full effective map  — as returned by login / getMe
//   (b) stored overrides only — as returned by PATCH /api/users/:id
// Either way the computation below is correct because we always fall back to
// the role default for any key not present in user.permissions.
export default function usePermissions() {
    const { user } = useAuth();

    const map = useMemo(() => {
        const out = {};
        if (!user) return out;
        PERMISSIONS.forEach((p) => {
            out[p.key] = hasEffectivePermission(user, p.key);
        });
        return out;
    }, [user]);

    const has = useCallback((key) => !!map[key], [map]);
    return { has, map };
}
