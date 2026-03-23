/**
 * Alerts store.
 *
 * Manages the alert list, loading state, selected alert, and WebSocket
 * live-update connection. All alert data flows through this store —
 * components never call apiClient directly for alerts.
 */

import { createStore } from 'solid-js/store';
import { apiClient } from '../api/client';
import type { AlertQuery, AlertStatus, KronAlert } from '../types/api';

interface AlertsState {
  alerts: KronAlert[];
  total: number;
  queryMs: number;
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
}

/**
 * Composable that exposes the alert queue state and actions.
 *
 * Returns a stable object — safe to destructure in SolidJS components
 * because the reactive state is in the store, not in the returned object.
 */
export function useAlerts() {
  const [state, setState] = createStore<AlertsState>({
    alerts: [],
    total: 0,
    queryMs: 0,
    isLoading: false,
    error: null,
    selectedId: null,
  });

  /**
   * Fetch the alert queue from the API, replacing current list.
   * Pass params to filter by status, severity, date range, etc.
   */
  const fetchAlerts = async (params?: AlertQuery): Promise<void> => {
    setState({ isLoading: true, error: null });
    try {
      const resp = await apiClient.getAlerts(params ?? {});
      setState({
        alerts: resp.alerts,
        total: resp.total,
        queryMs: resp.query_ms,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load alerts.';
      setState({ isLoading: false, error: message });
    }
  };

  /**
   * Acknowledge the given alert and update it in the local list.
   */
  const acknowledgeAlert = async (id: string): Promise<void> => {
    try {
      await apiClient.acknowledgeAlert(id);
      setState('alerts', (alerts) =>
        alerts.map((a) => (a.alert_id === id ? { ...a, status: 'acknowledged' as AlertStatus } : a))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to acknowledge alert.';
      setState({ error: message });
    }
  };

  /**
   * Mark the given alert as a false positive.
   */
  const markFalsePositive = async (id: string, notes?: string): Promise<void> => {
    try {
      await apiClient.markFalsePositive(id, notes);
      setState('alerts', (alerts) =>
        alerts.map((a) =>
          a.alert_id === id ? { ...a, status: 'false_positive' as AlertStatus } : a
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark false positive.';
      setState({ error: message });
    }
  };

  /** Set the currently selected alert ID for the detail panel. */
  const selectAlert = (id: string | null): void => {
    setState('selectedId', id);
  };

  /**
   * Prepend a new alert to the list (called from WebSocket handler).
   * Deduplicates by alert_id so reconnects do not create doubles.
   */
  const prependAlert = (alert: KronAlert): void => {
    setState('alerts', (existing) => {
      if (existing.some((a) => a.alert_id === alert.alert_id)) {
        return existing;
      }
      return [alert, ...existing];
    });
    setState('total', (n) => n + 1);
  };

  return {
    state,
    fetchAlerts,
    acknowledgeAlert,
    markFalsePositive,
    selectAlert,
    prependAlert,
  };
}
