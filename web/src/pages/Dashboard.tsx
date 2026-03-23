/**
 * Dashboard page.
 *
 * Shows high-level KPIs (open alerts by severity) and a live-refreshing
 * table of the five most recent open alerts.
 *
 * Data is loaded via the alerts and events stores so that all API access
 * goes through the central apiClient — never direct fetch() calls here.
 */

import type { JSX } from 'solid-js';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import Layout from '../components/layout/Layout';
import MetricCard from '../components/ui/MetricCard';
import SeverityBadge from '../components/ui/SeverityBadge';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import { useAlerts } from '../stores/alerts';
import { useAuth } from '../stores/auth';

const thStyle: JSX.CSSProperties = {
  padding: '8px 16px',
  'font-size': '11px',
  'font-weight': '500',
  color: 'var(--text-muted)',
  'text-align': 'left',
  'border-bottom': '1px solid var(--border)',
  'white-space': 'nowrap',
  'text-transform': 'uppercase',
  'letter-spacing': '0.05em',
};

const tdStyle: JSX.CSSProperties = {
  padding: '11px 16px',
  'font-size': '13px',
  'border-bottom': '1px solid var(--border-subtle)',
};

/**
 * Dashboard KPIs and recent critical alerts.
 *
 * Fetches open alerts on mount and derives per-severity counts
 * from the loaded list without additional API calls.
 */
export default function DashboardPage(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const { state, fetchAlerts } = useAlerts();
  const [hasLoaded, setHasLoaded] = createSignal(false);

  createEffect(() => {
    if (isAuthenticated() && !hasLoaded()) {
      setHasLoaded(true);
      void fetchAlerts({ status: 'open', limit: 50 });
    }
  });

  const p1Count = () => state.alerts.filter((a) => a.severity === 'critical').length;
  const p2Count = () => state.alerts.filter((a) => a.severity === 'high').length;
  const openCount = () => state.total;
  const recentAlerts = () => state.alerts.slice(0, 8);

  return (
    <Layout title="Dashboard">
      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          'grid-template-columns': 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '16px',
          'margin-bottom': '28px',
        }}
      >
        <MetricCard
          title="Open Alerts"
          value={state.isLoading ? '—' : openCount()}
          color="var(--primary)"
        />
        <MetricCard
          title="P1 Critical"
          value={state.isLoading ? '—' : p1Count()}
          color="var(--critical)"
          subtitle="Requires immediate action"
        />
        <MetricCard
          title="P2 High"
          value={state.isLoading ? '—' : p2Count()}
          color="var(--warning)"
          subtitle="Investigate within 1 h"
        />
        <MetricCard
          title="Detection Engine"
          value="Online"
          color="var(--success)"
          subtitle="Stream processor active"
        />
      </div>

      {/* Recent open alerts table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            'border-bottom': '1px solid var(--border)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
          }}
        >
          <h2 style={{ 'font-size': '14px', 'font-weight': '600' }}>Recent Open Alerts</h2>
          <A
            href="/alerts"
            style={{
              'font-size': '12px',
              color: 'var(--primary)',
              'text-decoration': 'none',
            }}
          >
            View all →
          </A>
        </div>

        <Show
          when={!state.isLoading}
          fallback={
            <div style={{ padding: '20px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <LoadingSkeleton height={20} />
              <LoadingSkeleton height={20} width="85%" />
              <LoadingSkeleton height={20} width="70%" />
              <LoadingSkeleton height={20} width="90%" />
              <LoadingSkeleton height={20} width="75%" />
            </div>
          }
        >
          <Show
            when={state.error === null}
            fallback={
              <div style={{ padding: '20px', color: 'var(--danger)', 'font-size': '13px' }}>
                {state.error}
              </div>
            }
          >
            <table
              style={{ width: '100%', 'border-collapse': 'collapse' }}
              aria-label="Recent open alerts"
            >
              <thead>
                <tr>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Rule</th>
                  <th style={thStyle}>Asset</th>
                  <th style={thStyle}>MITRE Tactic</th>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Risk</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={recentAlerts().length > 0}
                  fallback={
                    <tr>
                      <td
                        colspan={6}
                        style={{
                          ...tdStyle,
                          'text-align': 'center',
                          color: 'var(--text-muted)',
                          padding: '32px',
                        }}
                      >
                        No open alerts. The platform is quiet.
                      </td>
                    </tr>
                  }
                >
                  <For each={recentAlerts()}>
                    {(alert) => (
                      <tr class="kron-dashboard-row">
                        <td style={tdStyle}>
                          <SeverityBadge severity={alert.severity} />
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            'max-width': '260px',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                          }}
                        >
                          <A
                            href={`/alerts`}
                            style={{ color: 'var(--text)', 'text-decoration': 'none' }}
                          >
                            {alert.rule_name}
                          </A>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', 'font-size': '12px' }}>
                          {alert.affected_assets[0] ?? '—'}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', 'font-size': '12px' }}>
                          {alert.mitre_tactic ?? '—'}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            'font-family': 'var(--font-mono)',
                            'font-size': '11px',
                            color: 'var(--text-muted)',
                            'white-space': 'nowrap',
                          }}
                        >
                          {new Date(alert.created_at).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td style={{ ...tdStyle, 'font-family': 'var(--font-mono)', 'font-size': '12px' }}>
                          <span
                            style={{
                              color:
                                alert.risk_score >= 80
                                  ? 'var(--danger)'
                                  : alert.risk_score >= 60
                                    ? 'var(--warning)'
                                    : 'var(--text-muted)',
                            }}
                          >
                            {alert.risk_score}
                          </span>
                          <span style={{ color: 'var(--text-dim)', 'font-size': '10px' }}>/100</span>
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </Show>
        </Show>
      </div>

      <style>{`
        .kron-dashboard-row:hover td {
          background: var(--surface2);
          cursor: pointer;
        }
      `}</style>
    </Layout>
  );
}
