/**
 * Auth store.
 *
 * Manages JWT, tenant context, and role for the current session.
 * Persists the token to sessionStorage so a page refresh doesn't log you out
 * (intentionally not localStorage — closes on tab close for security).
 */
import { createStore } from 'solid-js/store';
import { apiClient } from '../api/client';
const SESSION_KEY = 'kron_token';
function loadStoredToken() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw === null)
            return { token: null, tenantId: null, role: null, expiresAt: null };
        const stored = JSON.parse(raw);
        // Reject expired tokens immediately on load.
        if (new Date(stored.expiresAt) <= new Date()) {
            sessionStorage.removeItem(SESSION_KEY);
            return { token: null, tenantId: null, role: null, expiresAt: null };
        }
        apiClient.setToken(stored.token);
        return stored;
    }
    catch {
        return { token: null, tenantId: null, role: null, expiresAt: null };
    }
}
const [authState, setAuthState] = createStore({
    ...loadStoredToken(),
    isLoading: false,
    error: null,
});
/**
 * Composable that exposes authentication state and actions.
 *
 * Pattern: single store instance at module level, hook re-exported for
 * SolidJS reactive access. Components call `useAuth()` to get a stable
 * reference to state and actions.
 */
export function useAuth() {
    /**
     * Authenticate with the backend and persist the resulting JWT.
     */
    const login = async (req) => {
        setAuthState({ isLoading: true, error: null });
        try {
            const resp = await apiClient.login(req);
            const stored = {
                token: resp.token,
                tenantId: resp.tenant_id,
                role: resp.role,
                expiresAt: resp.expires_at,
            };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
            setAuthState({ ...stored, isLoading: false, error: null });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
            setAuthState({ isLoading: false, error: message });
            throw err;
        }
    };
    /**
     * Invalidate the session server-side and clear all local state.
     */
    const logout = async () => {
        try {
            await apiClient.logout();
        }
        catch {
            // Ignore server errors on logout — clear local state regardless.
        }
        sessionStorage.removeItem(SESSION_KEY);
        setAuthState({
            token: null,
            tenantId: null,
            role: null,
            expiresAt: null,
            isLoading: false,
            error: null,
        });
    };
    /** Returns true when a (possibly expired) token is present in state. */
    const isAuthenticated = () => authState.token !== null;
    /** Returns true when the current role permits the given action. */
    const hasRole = (requiredRole) => {
        const roleOrder = {
            viewer: 1,
            analyst: 2,
            admin: 3,
            superadmin: 4,
        };
        const current = authState.role ?? '';
        return (roleOrder[current] ?? 0) >= (roleOrder[requiredRole] ?? 999);
    };
    return { authState, login, logout, isAuthenticated, hasRole };
}
