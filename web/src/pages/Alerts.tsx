/**
 * Alerts page.
 *
 * Split-pane layout: left panel shows the alert queue with status filters,
 * right panel shows the selected alert detail with narrative and action buttons.
 *
 * Integrates the WebSocket stream so new alerts appear without polling.
 */

import type { JSX } from 'solid-js';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import Layout from '../components/layout/Layout';
import SeverityBadge from '../components/ui/SeverityBadge';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import { useAlerts } from '../stores/alerts';
import { useAuth } from '../stores/auth';
import { apiClient } from '../api/client';
import type { AlertStatus, KronAlert } from '../types/api';

const STATUS_OPTIONS: AlertStatus[] = ['open', 'acknowledged', 'resolved', 'false_positive'];

const STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Open',
  acknowledged: 'Ack',
  resolved: 'Resolved',
  false_positive: 'FP',
};

const STATUS_COLOR: Record<AlertStatus, string> = {
  open: 'var(--danger)',
  acknowledged: 'var(--warning)',
  resolved: 'var(--success)',
  false_positive: 'var(--text-muted)',
};

const detailLabelStyle: JSX.CSSProperties = {
  'font-size': '11px',
  'font-weight': '500',
  color: 'var(--text-muted)',
  'text-transform': 'uppercase',
  'letter-spacing': '0.05em',
  'margin-bottom': '4px',
};

const detailValueStyle: JSX.CSSProperties = {
  'font-size': '13px',
  color: 'var(--text)',
};

function DetailField(props: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius-md)',
        padding: '12px 14px',
      }}
    >
      <p style={detailLabelStyle}>{props.label}</p>
      <p style={detailValueStyle}>{props.value}</p>
    </div>
  );
}

function ActionButton(props: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        padding: '8px 16px',
        background: `color-mix(in srgb, ${props.color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${props.color} 40%, transparent)`,
        color: props.color,
        'border-radius': 'var(--radius-md)',
        'font-size': '13px',
        'font-weight': '500',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        transition: 'opacity var(--transition-fast)',
      }}
    >
      {props.label}
    </button>
  );
}

/**
 * Alert queue with split-pane detail view and live WebSocket stream.
 */
export default function AlertsPage(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const { state, fetchAlerts, acknowledgeAlert, markFalsePositive, selectAlert, prependAlert } =
    useAlerts();

  const [statusFilter, setStatusFilter] = createSignal<AlertStatus>('open');
  const [resolutionNotes, setResolutionNotes] = createSignal('');
  const [actionError, setActionError] = createSignal<string | null>(null);

  // Initial load and re-fetch when filter changes.
  createEffect(() => {
    if (isAuthenticated()) {
      void fetchAlerts({ status: statusFilter(), limit: 200 });
    }
  });

  // Subscribe to the live alert WebSocket stream.
  createEffect(() => {
    if (!isAuthenticated()) return;
    const ws = apiClient.createAlertWebSocket(
      (alert) => prependAlert(alert),
      () => {
        // Connection closed — reconnect after a short delay.
        // TODO(#TBD, hardik, v1.1): implement exponential backoff reconnect
        setTimeout(() => {
          if (isAuthenticated()) {
            void fetchAlerts({ status: statusFilter(), limit: 200 });
          }
        }, 5000);
      }
    );
    onCleanup(() => ws.close());
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // J — next alert    K — previous alert
  // A — acknowledge   F — false positive   Space — select first if none
  createEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when focus is inside an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const alerts = state.alerts;
      const currentIdx = alerts.findIndex((a) => a.alert_id === state.selectedId);

      switch (e.key) {
        case 'j':
        case 'J': {
          e.preventDefault();
          const nextIdx = currentIdx < alerts.length - 1 ? currentIdx + 1 : 0;
          if (alerts[nextIdx]) {
            selectAlert(alerts[nextIdx].alert_id);
            setActionError(null);
            setResolutionNotes('');
          }
          break;
        }
        case 'k':
        case 'K': {
          e.preventDefault();
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : alerts.length - 1;
          if (alerts[prevIdx]) {
            selectAlert(alerts[prevIdx].alert_id);
            setActionError(null);
            setResolutionNotes('');
          }
          break;
        }
        case 'a':
        case 'A': {
          if (state.selectedId) { e.preventDefault(); void handleAcknowledge(); }
          break;
        }
        case 'f':
        case 'F': {
          if (state.selectedId) { e.preventDefault(); void handleFalsePositive(); }
          break;
        }
        case ' ': {
          e.preventDefault();
          if (!state.selectedId && alerts[0]) selectAlert(alerts[0].alert_id);
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    onCleanup(() => document.removeEventListener('keydown', handler));
  });

  const selectedAlert = (): KronAlert | undefined =>
    state.alerts.find((a) => a.alert_id === state.selectedId);

  const handleAcknowledge = async (): Promise<void> => {
    if (!state.selectedId) return;
    setActionError(null);
    try {
      await acknowledgeAlert(state.selectedId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleFalsePositive = async (): Promise<void> => {
    if (!state.selectedId) return;
    setActionError(null);
    try {
      await markFalsePositive(state.selectedId, resolutionNotes() || undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleResolve = async (): Promise<void> => {
    if (!state.selectedId) return;
    setActionError(null);
    try {
      await apiClient.updateAlert(state.selectedId, {
        status: 'resolved',
        resolution_notes: resolutionNotes() || undefined,
      });
      void fetchAlerts({ status: statusFilter(), limit: 200 });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  return (
    <Layout title="Alert Queue">
      <div
        style={{
          display: 'flex',
          gap: '0',
          height: 'calc(100vh - 56px - 48px)',
          margin: '-24px',
        }}
      >
        {/* LEFT: Alert list */}
        <div
          style={{
            width: '420px',
            'min-width': '320px',
            'flex-shrink': '0',
            display: 'flex',
            'flex-direction': 'column',
            'border-right': '1px solid var(--border)',
            background: 'var(--surface)',
            'overflow-y': 'hidden',
          }}
        >
          {/* Status filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              padding: '10px 12px',
              'border-bottom': '1px solid var(--border)',
              'flex-shrink': '0',
            }}
          >
            <For each={STATUS_OPTIONS}>
              {(s) => (
                <button
                  onClick={() => {
                    setStatusFilter(s);
                    selectAlert(null);
                  }}
                  style={{
                    padding: '4px 10px',
                    'border-radius': 'var(--radius-sm)',
                    'font-size': '12px',
                    border: '1px solid',
                    cursor: 'pointer',
                    'border-color': statusFilter() === s ? 'var(--primary)' : 'var(--border)',
                    background: statusFilter() === s ? 'var(--primary-dim)' : 'transparent',
                    color: statusFilter() === s ? 'var(--primary)' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              )}
            </For>
            <span
              style={{
                'margin-left': 'auto',
                'font-size': '11px',
                color: 'var(--text-muted)',
                'align-self': 'center',
              }}
            >
              {state.total} total
            </span>
          </div>

          {/* Alert rows */}
          <div style={{ 'overflow-y': 'auto', flex: '1' }}>
            <Show
              when={!state.isLoading}
              fallback={
                <div style={{ padding: '16px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
                  <For each={Array.from({ length: 8 })}>
                    {() => <LoadingSkeleton height={52} radius={6} />}
                  </For>
                </div>
              }
            >
              <Show
                when={state.error === null}
                fallback={
                  <div style={{ padding: '16px', color: 'var(--danger)', 'font-size': '13px' }}>
                    {state.error}
                  </div>
                }
              >
                <Show
                  when={state.alerts.length > 0}
                  fallback={
                    <div
                      style={{
                        padding: '48px 16px',
                        'text-align': 'center',
                        color: 'var(--text-muted)',
                        'font-size': '13px',
                      }}
                    >
                      No {statusFilter()} alerts.
                    </div>
                  }
                >
                  <For each={state.alerts}>
                    {(alert) => {
                      const isSelected = () => state.selectedId === alert.alert_id;
                      return (
                        <button
                          onClick={() => {
                            selectAlert(alert.alert_id);
                            setActionError(null);
                            setResolutionNotes('');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            display: 'flex',
                            'flex-direction': 'column',
                            gap: '4px',
                            'text-align': 'left',
                            background: isSelected() ? 'var(--primary-dim)' : 'transparent',
                            'border-left': isSelected()
                              ? '2px solid var(--primary)'
                              : '2px solid transparent',
                            'border-right': 'none',
                            'border-top': 'none',
                            'border-bottom': '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            transition: 'background var(--transition-fast)',
                          }}
                          aria-selected={isSelected()}
                        >
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                            <SeverityBadge severity={alert.severity} />
                            <span
                              style={{
                                'font-size': '12px',
                                'font-weight': '500',
                                color: 'var(--text)',
                                flex: '1',
                                overflow: 'hidden',
                                'text-overflow': 'ellipsis',
                                'white-space': 'nowrap',
                              }}
                            >
                              {alert.rule_name}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: '10px',
                              'font-size': '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span>{alert.affected_assets[0] ?? '—'}</span>
                            <span style={{ 'margin-left': 'auto', 'font-family': 'var(--font-mono)' }}>
                              {new Date(alert.created_at).toLocaleTimeString('en-IN')}
                            </span>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </Show>
              </Show>
            </Show>
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        <div style={{ flex: '1', 'overflow-y': 'auto', padding: '24px' }}>
          <Show
            when={selectedAlert() !== undefined}
            fallback={
              <div
                style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  'align-items': 'center',
                  'justify-content': 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  gap: '8px',
                }}
              >
                <p style={{ 'font-size': '15px' }}>Select an alert to view details</p>
                <p style={{ 'font-size': '12px', color: 'var(--text-dim)' }}>
                  Click any row on the left panel
                </p>
                <p style={{ 'font-size': '11px', color: 'var(--text-dim)', 'margin-top': '8px', 'font-family': 'var(--font-mono)' }}>
                  J/K navigate · A acknowledge · F false positive · Space select
                </p>
              </div>
            }
          >
            {(() => {
              const alert = selectedAlert();
              if (!alert) return null;

              return (
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px', 'max-width': '760px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
                    <SeverityBadge severity={alert.severity} large />
                    <div>
                      <h2 style={{ 'font-size': '17px', 'font-weight': '600', 'margin-bottom': '4px' }}>
                        {alert.rule_name}
                      </h2>
                      <div style={{ display: 'flex', gap: '12px', 'font-size': '12px', color: 'var(--text-muted)' }}>
                        <span>
                          Status:{' '}
                          <span style={{ color: STATUS_COLOR[alert.status] }}>
                            {alert.status.replace('_', ' ')}
                          </span>
                        </span>
                        <span>Risk score: <strong style={{ color: 'var(--text)' }}>{alert.risk_score}/100</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Narrative */}
                  <div
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      'border-radius': 'var(--radius-md)',
                      padding: '16px',
                      'font-size': '13px',
                      'line-height': '1.65',
                      color: 'var(--text)',
                    }}
                  >
                    <p style={detailLabelStyle}>Narrative</p>
                    <p style={{ 'margin-top': '8px' }}>{alert.narrative_en}</p>
                    <Show when={alert.narrative_hi}>
                      <p style={{ 'margin-top': '12px', color: 'var(--text-muted)', 'font-size': '12px' }}>
                        {alert.narrative_hi}
                      </p>
                    </Show>
                  </div>

                  {/* Metadata grid */}
                  <div
                    style={{
                      display: 'grid',
                      'grid-template-columns': 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <DetailField label="MITRE Tactic" value={alert.mitre_tactic ?? '—'} />
                    <DetailField label="MITRE Technique" value={alert.mitre_technique ?? '—'} />
                    <DetailField
                      label="Affected Assets"
                      value={alert.affected_assets.join(', ') || '—'}
                    />
                    <DetailField
                      label="Affected Users"
                      value={alert.affected_users.join(', ') || '—'}
                    />
                    <DetailField
                      label="Created"
                      value={new Date(alert.created_at).toLocaleString('en-IN')}
                    />
                    <DetailField label="Assigned To" value={alert.assigned_to ?? '—'} />
                  </div>

                  {/* Notification indicators */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span
                      style={{
                        'font-size': '11px',
                        padding: '2px 8px',
                        'border-radius': 'var(--radius-sm)',
                        background: alert.whatsapp_sent ? 'rgba(16,185,129,0.15)' : 'transparent',
                        border: '1px solid',
                        'border-color': alert.whatsapp_sent
                          ? 'rgba(16,185,129,0.4)'
                          : 'var(--border)',
                        color: alert.whatsapp_sent ? 'var(--success)' : 'var(--text-dim)',
                      }}
                    >
                      WhatsApp {alert.whatsapp_sent ? 'sent' : 'not sent'}
                    </span>
                    <Show when={alert.sms_sent !== undefined}>
                      <span
                        style={{
                          'font-size': '11px',
                          padding: '2px 8px',
                          'border-radius': 'var(--radius-sm)',
                          background: alert.sms_sent ? 'rgba(16,185,129,0.15)' : 'transparent',
                          border: '1px solid',
                          'border-color': alert.sms_sent ? 'rgba(16,185,129,0.4)' : 'var(--border)',
                          color: alert.sms_sent ? 'var(--success)' : 'var(--text-dim)',
                        }}
                      >
                        SMS {alert.sms_sent ? 'sent' : 'not sent'}
                      </span>
                    </Show>
                  </div>

                  {/* Resolution notes input */}
                  <Show when={alert.status === 'open' || alert.status === 'acknowledged'}>
                    <div>
                      <label
                        for="resolution-notes"
                        style={{ ...detailLabelStyle, display: 'block', 'margin-bottom': '6px' }}
                      >
                        Resolution Notes (optional)
                      </label>
                      <textarea
                        id="resolution-notes"
                        rows={3}
                        value={resolutionNotes()}
                        onInput={(e) => setResolutionNotes(e.currentTarget.value)}
                        placeholder="Describe what you found and what action was taken…"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          'border-radius': 'var(--radius-md)',
                          color: 'var(--text)',
                          'font-size': '13px',
                          resize: 'vertical',
                          outline: 'none',
                          'box-sizing': 'border-box',
                        }}
                      />
                    </div>
                  </Show>

                  {/* Action error */}
                  <Show when={actionError() !== null}>
                    <div
                      role="alert"
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid var(--danger)',
                        'border-radius': 'var(--radius-md)',
                        padding: '10px 12px',
                        'font-size': '13px',
                        color: '#fca5a5',
                      }}
                    >
                      {actionError()}
                    </div>
                  </Show>

                  {/* Action buttons */}
                  <Show when={alert.status === 'open'}>
                    <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
                      <ActionButton
                        label="Acknowledge"
                        color="var(--primary)"
                        onClick={() => void handleAcknowledge()}
                      />
                      <ActionButton
                        label="Resolve"
                        color="var(--success)"
                        onClick={() => void handleResolve()}
                      />
                      <ActionButton
                        label="False Positive"
                        color="var(--text-muted)"
                        onClick={() => void handleFalsePositive()}
                      />
                    </div>
                  </Show>
                  <Show when={alert.status === 'acknowledged'}>
                    <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
                      <ActionButton
                        label="Resolve"
                        color="var(--success)"
                        onClick={() => void handleResolve()}
                      />
                      <ActionButton
                        label="False Positive"
                        color="var(--text-muted)"
                        onClick={() => void handleFalsePositive()}
                      />
                    </div>
                  </Show>
                </div>
              );
            })()}
          </Show>
        </div>
      </div>
    </Layout>
  );
}
