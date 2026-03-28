/**
 * KRON API client.
 *
 * ALL API calls in the application go through this file.
 * No component or store may call fetch() directly.
 *
 * Usage:
 *   import { apiClient } from '../api/client';
 *   const alerts = await apiClient.getAlerts({ status: 'open' });
 */
import { isApiError } from '../types/api';
const API_BASE = import.meta.env['VITE_API_URL'] ?? '/api/v1';
const WS_BASE = import.meta.env['VITE_WS_URL'] ?? '';
/** Derives WebSocket base URL from API base when not explicitly set. */
function resolveWsBase() {
    if (WS_BASE)
        return WS_BASE;
    const origin = window.location.origin.replace(/^http/, 'ws');
    return origin;
}
/**
 * Typed error thrown when the API returns a non-2xx response.
 * Consumers should catch this and display `.message` to the user.
 */
export class ApiRequestError extends Error {
    code;
    status;
    traceId;
    constructor(message, code, status, traceId) {
        super(message);
        this.name = 'ApiRequestError';
        this.code = code;
        this.status = status;
        this.traceId = traceId;
    }
}
/** Serialises a query-params object into a URL search string, omitting undefined values. */
function buildQueryString(params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (entries.length === 0)
        return '';
    const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return `?${qs.join('&')}`;
}
class ApiClient {
    token = null;
    /** Store the JWT so subsequent requests are authenticated. */
    setToken(token) {
        this.token = token;
    }
    /** Remove the JWT (called on logout or 401). */
    clearToken() {
        this.token = null;
    }
    /** Returns true when a token is present (does not validate expiry). */
    hasToken() {
        return this.token !== null;
    }
    /**
     * Core request method. All public methods delegate here.
     *
     * - Injects Authorization header when a token is set.
     * - Parses JSON response body.
     * - Throws ApiRequestError on non-2xx status.
     * - On 401, clears the token and redirects to /login.
     */
    async request(path, options) {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (this.token !== null) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                ...headers,
                ...options?.headers,
            },
        });
        if (response.status === 401) {
            this.clearToken();
            window.location.href = '/login';
            // Throw so the calling promise chain is also aborted.
            throw new ApiRequestError('Session expired. Please log in again.', 'AUTH_EXPIRED', 401);
        }
        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.json();
            }
            catch {
                errorBody = null;
            }
            if (isApiError(errorBody)) {
                throw new ApiRequestError(errorBody.error, errorBody.code, response.status, errorBody.trace_id);
            }
            throw new ApiRequestError(`Request failed with status ${response.status}`, 'HTTP_ERROR', response.status);
        }
        if (response.status === 204) {
            return undefined;
        }
        return response.json();
    }
    // ─── Auth ─────────────────────────────────────────────────────────────────
    /**
     * Authenticate with email, password, and optional TOTP code.
     * Automatically stores the returned JWT.
     */
    async login(req) {
        const resp = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(req),
        });
        this.setToken(resp.token);
        return resp;
    }
    /**
     * Invalidate the current session server-side and clear local token.
     */
    async logout() {
        await this.request('/auth/logout', { method: 'POST' });
        this.clearToken();
    }
    // ─── Events ───────────────────────────────────────────────────────────────
    /**
     * Fetch a paginated, filtered list of normalised events.
     */
    async getEvents(params) {
        const qs = buildQueryString(params);
        return this.request(`/events${qs}`);
    }
    /**
     * Fetch a single event by its ID.
     */
    async getEvent(id) {
        return this.request(`/events/${encodeURIComponent(id)}`);
    }
    // ─── Alerts ───────────────────────────────────────────────────────────────
    /**
     * Fetch a paginated, filtered alert queue.
     */
    async getAlerts(params) {
        const qs = buildQueryString(params);
        return this.request(`/alerts${qs}`);
    }
    /**
     * Fetch a single alert by its ID.
     */
    async getAlert(id) {
        return this.request(`/alerts/${encodeURIComponent(id)}`);
    }
    /**
     * Update alert status, resolution notes, or assignment.
     */
    async updateAlert(id, req) {
        return this.request(`/alerts/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(req),
        });
    }
    /**
     * Acknowledge an alert (shorthand for updateAlert with status: 'acknowledged').
     */
    async acknowledgeAlert(id) {
        await this.request(`/alerts/${encodeURIComponent(id)}/acknowledge`, {
            method: 'POST',
        });
    }
    /**
     * Mark an alert as a false positive.
     */
    async markFalsePositive(id, notes) {
        await this.request(`/alerts/${encodeURIComponent(id)}/false-positive`, {
            method: 'POST',
            body: JSON.stringify({ resolution_notes: notes ?? '' }),
        });
    }
    // ─── Rules ────────────────────────────────────────────────────────────────
    /**
     * Create a new detection rule (no-code builder output).
     */
    async createRule(body) {
        return this.request('/rules', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
    // ─── Health ───────────────────────────────────────────────────────────────
    /**
     * Check platform health. Does not require authentication.
     */
    async getHealth() {
        return this.request('/health');
    }
    // ─── Compliance ───────────────────────────────────────────────────────────
    /**
     * Lists all compliance reports for the authenticated tenant.
     */
    async getComplianceReports() {
        return this.request('/compliance/reports');
    }
    /**
     * Triggers generation of a new compliance report.
     */
    async generateComplianceReport(body) {
        await this.request('/compliance/reports', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
    // ─── Tenants (MSSP) ───────────────────────────────────────────────────────
    /**
     * Lists all tenants. Super-admin only.
     */
    async listTenants() {
        return this.request('/tenants');
    }
    /**
     * Creates a new tenant. Super-admin only.
     */
    async createTenant(body) {
        await this.request('/tenants', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
    // ─── WebSocket streams ────────────────────────────────────────────────────
    /**
     * Opens a WebSocket connection for the live alert stream.
     *
     * @param onMessage - Called for each incoming alert.
     * @param onClose   - Called when the connection closes (network drop, server restart, etc.).
     * @returns The raw WebSocket instance. Caller is responsible for calling .close().
     */
    createAlertWebSocket(onMessage, onClose) {
        const wsBase = resolveWsBase();
        const url = `${wsBase}/api/v1/alerts/stream${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`;
        const ws = new WebSocket(url);
        ws.onmessage = (event) => {
            let parsed;
            try {
                parsed = JSON.parse(event.data);
            }
            catch {
                return;
            }
            onMessage(parsed);
        };
        ws.onclose = () => onClose();
        ws.onerror = () => onClose();
        return ws;
    }
    /**
     * Opens a WebSocket connection for the live event tail stream.
     *
     * @param onMessage - Called for each incoming event.
     * @param onClose   - Called when the connection closes.
     * @returns The raw WebSocket instance.
     */
    createEventWebSocket(onMessage, onClose) {
        const wsBase = resolveWsBase();
        const url = `${wsBase}/api/v1/events/stream${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`;
        const ws = new WebSocket(url);
        ws.onmessage = (event) => {
            let parsed;
            try {
                parsed = JSON.parse(event.data);
            }
            catch {
                return;
            }
            onMessage(parsed);
        };
        ws.onclose = () => onClose();
        ws.onerror = () => onClose();
        return ws;
    }
}
/**
 * Singleton API client instance.
 * Import this in stores and never create a second instance.
 */
export const apiClient = new ApiClient();
