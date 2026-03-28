/**
 * MITRE ATT&CK page.
 *
 * Displays a heatmap of the 14 MITRE tactics. Each cell shows the count of
 * open alerts mapped to that tactic. Clicking a cell navigates to the
 * Alerts page pre-filtered by that tactic.
 *
 * Alert counts are derived from the alerts store (open status) so no extra
 * API call is needed — the dashboard already loads open alerts.
 */
import { createEffect, createSignal, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import Layout from '../components/layout/Layout';
import { useAlerts } from '../stores/alerts';
import { useAuth } from '../stores/auth';
const TACTICS = [
    { id: 'TA0043', name: 'Reconnaissance', apiName: 'reconnaissance' },
    { id: 'TA0042', name: 'Resource Development', apiName: 'resource-development' },
    { id: 'TA0001', name: 'Initial Access', apiName: 'initial-access' },
    { id: 'TA0002', name: 'Execution', apiName: 'execution' },
    { id: 'TA0003', name: 'Persistence', apiName: 'persistence' },
    { id: 'TA0004', name: 'Privilege Escalation', apiName: 'privilege-escalation' },
    { id: 'TA0005', name: 'Defense Evasion', apiName: 'defense-evasion' },
    { id: 'TA0006', name: 'Credential Access', apiName: 'credential-access' },
    { id: 'TA0007', name: 'Discovery', apiName: 'discovery' },
    { id: 'TA0008', name: 'Lateral Movement', apiName: 'lateral-movement' },
    { id: 'TA0009', name: 'Collection', apiName: 'collection' },
    { id: 'TA0011', name: 'Command & Control', apiName: 'command-and-control' },
    { id: 'TA0010', name: 'Exfiltration', apiName: 'exfiltration' },
    { id: 'TA0040', name: 'Impact', apiName: 'impact' },
];
/** Interpolates a colour between the surface base and danger red based on ratio 0–1. */
function heatColor(ratio) {
    if (ratio === 0) {
        return {
            background: 'var(--surface)',
            border: 'var(--border)',
            text: 'var(--text-dim)',
        };
    }
    if (ratio < 0.3) {
        return {
            background: 'rgba(245,158,11,0.12)',
            border: 'rgba(245,158,11,0.35)',
            text: 'var(--warning)',
        };
    }
    if (ratio < 0.7) {
        return {
            background: 'rgba(239,68,68,0.15)',
            border: 'rgba(239,68,68,0.4)',
            text: 'var(--danger)',
        };
    }
    return {
        background: 'rgba(220,38,38,0.25)',
        border: 'rgba(220,38,38,0.6)',
        text: '#fca5a5',
    };
}
/**
 * MITRE ATT&CK heatmap driven by the current open alert dataset.
 */
export default function MitrePage() {
    const { isAuthenticated } = useAuth();
    const { state, fetchAlerts } = useAlerts();
    const navigate = useNavigate();
    const [hasLoaded, setHasLoaded] = createSignal(false);
    createEffect(() => {
        if (isAuthenticated() && !hasLoaded()) {
            setHasLoaded(true);
            // Load open alerts if not already loaded.
            if (state.alerts.length === 0 && !state.isLoading) {
                void fetchAlerts({ status: 'open', limit: 500 });
            }
        }
    });
    /** Count open alerts per tactic (case-insensitive partial match). */
    const countForTactic = (tactic) => state.alerts.filter((a) => a.mitre_tactic !== undefined &&
        a.mitre_tactic.toLowerCase().replace(/[\s-]/g, '') ===
            tactic.name.toLowerCase().replace(/[\s-]/g, '')).length;
    const maxCount = () => {
        const counts = TACTICS.map((t) => countForTactic(t));
        return Math.max(...counts, 1); // avoid division by zero
    };
    const handleTacticClick = (tactic) => {
        void navigate(`/alerts?mitre_tactic=${encodeURIComponent(tactic.apiName)}`);
    };
    return (<Layout title="MITRE ATT&CK Coverage">
      <p style={{
            'font-size': '13px',
            color: 'var(--text-muted)',
            'margin-bottom': '20px',
            'max-width': '640px',
            'line-height': '1.6',
        }}>
        Alert hit counts per MITRE ATT&CK tactic across current open alerts. Click any cell to
        filter the alert queue by that tactic.
      </p>

      <Show when={state.isLoading}>
        <p style={{ 'font-size': '13px', color: 'var(--text-muted)', 'margin-bottom': '16px' }}>
          Loading alert data…
        </p>
      </Show>

      {/* Heatmap grid */}
      <div style={{
            display: 'grid',
            'grid-template-columns': 'repeat(7, minmax(120px, 1fr))',
            gap: '10px',
            'margin-bottom': '32px',
        }} role="list" aria-label="MITRE ATT&CK tactic heatmap">
        <For each={TACTICS}>
          {(tactic) => {
            const count = () => countForTactic(tactic);
            const ratio = () => count() / maxCount();
            const colors = () => heatColor(ratio());
            return (<button role="listitem" onClick={() => handleTacticClick(tactic)} aria-label={`${tactic.name}: ${count()} alerts. Click to filter.`} style={{
                    background: colors().background,
                    border: `1px solid ${colors().border}`,
                    'border-radius': 'var(--radius-md)',
                    padding: '14px 12px',
                    cursor: 'pointer',
                    'text-align': 'left',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '8px',
                }} class="kron-tactic-cell">
                <span style={{
                    'font-size': '10px',
                    'font-weight': '500',
                    color: 'var(--text-muted)',
                    'font-family': 'var(--font-mono)',
                }}>
                  {tactic.id}
                </span>
                <span style={{
                    'font-size': '12px',
                    'font-weight': '600',
                    color: count() > 0 ? 'var(--text)' : 'var(--text-muted)',
                    'line-height': '1.3',
                }}>
                  {tactic.name}
                </span>
                <span style={{
                    'font-size': '24px',
                    'font-weight': '700',
                    color: colors().text,
                    'font-variant-numeric': 'tabular-nums',
                    'line-height': '1',
                }}>
                  {count()}
                </span>
              </button>);
        }}
        </For>
      </div>

      {/* Legend */}
      <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '16px',
            'font-size': '12px',
            color: 'var(--text-muted)',
        }}>
        <span>Legend:</span>
        {[
            { label: '0 alerts', bg: 'var(--surface)', border: 'var(--border)', text: 'var(--text-dim)' },
            { label: 'Low', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: 'var(--warning)' },
            { label: 'Medium', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: 'var(--danger)' },
            { label: 'High', bg: 'rgba(220,38,38,0.25)', border: 'rgba(220,38,38,0.6)', text: '#fca5a5' },
        ].map((item) => (<div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <div style={{
                width: '16px',
                height: '16px',
                background: item.bg,
                border: `1px solid ${item.border}`,
                'border-radius': '3px',
            }}/>
            <span>{item.label}</span>
          </div>))}
      </div>

      <style>{`
        .kron-tactic-cell:hover {
          filter: brightness(1.15);
          transform: translateY(-1px);
        }
      `}</style>
    </Layout>);
}
