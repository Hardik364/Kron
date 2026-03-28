/**
 * Compliance — dashboard and report generation page.
 *
 * Allows analysts and admins to generate compliance reports for enabled
 * frameworks and download evidence packages for audit submission.
 */
import { createSignal, For, onMount, Show } from 'solid-js';
import { apiClient } from '../api/client';
const FRAMEWORKS = [
    { id: 'cert_in', label: 'CERT-In', desc: 'CERT-In Directions 2022 — 13 incident categories' },
    { id: 'dpdp', label: 'DPDP Act', desc: 'Digital Personal Data Protection Act 2023' },
    { id: 'rbi', label: 'RBI IS', desc: 'RBI Information Security Framework' },
    { id: 'sebi_cscrf', label: 'SEBI CSCRF', desc: 'Cyber Security & Resilience Framework' },
];
const STATUS_COLOR = {
    ready: '#057a55',
    pending: '#b45309',
    failed: '#991b1b',
};
export default function Compliance() {
    const [reports, setReports] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [generating, setGenerating] = createSignal(false);
    const [error, setError] = createSignal('');
    const [genError, setGenError] = createSignal('');
    const [framework, setFramework] = createSignal('cert_in');
    const [fromDate, setFromDate] = createSignal(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [toDate, setToDate] = createSignal(new Date().toISOString().slice(0, 10));
    onMount(() => void loadReports());
    async function loadReports() {
        setLoading(true);
        try {
            const data = await apiClient.getComplianceReports();
            setReports(data);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load reports');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleGenerate(e) {
        e.preventDefault();
        setGenerating(true);
        setGenError('');
        try {
            await apiClient.generateComplianceReport({
                framework: framework(),
                from: new Date(fromDate()).toISOString(),
                to: new Date(toDate()).toISOString(),
            });
            await loadReports();
        }
        catch (e) {
            setGenError(e instanceof Error ? e.message : 'Failed to generate report');
        }
        finally {
            setGenerating(false);
        }
    }
    async function downloadEvidence(reportId) {
        try {
            const token = localStorage.getItem('kron_token') ?? '';
            const res = await fetch(`/api/v1/compliance/reports/${reportId}/evidence`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kron-evidence-${reportId}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Download failed');
        }
    }
    return (<div style={{ padding: '24px', 'max-width': '1000px' }}>
      <h1 style={{ 'font-size': '22px', 'font-weight': '700', margin: '0 0 4px' }}>Compliance</h1>
      <p style={{ color: 'var(--text-muted)', 'font-size': '13px', margin: '0 0 28px' }}>
        Generate compliance reports for CERT-In, DPDP Act, RBI IS, and SEBI CSCRF.
      </p>

      {/* Framework cards */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', 'margin-bottom': '28px' }}>
        <For each={FRAMEWORKS}>
          {(fw) => (<button onClick={() => setFramework(fw.id)} style={{
                padding: '16px',
                'border-radius': '8px',
                border: framework() === fw.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                background: framework() === fw.id ? 'rgba(59,130,246,0.08)' : 'var(--surface)',
                'text-align': 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
            }}>
              <div style={{ 'font-weight': '700', 'font-size': '14px', color: framework() === fw.id ? 'var(--accent)' : 'var(--text)', 'margin-bottom': '4px' }}>
                {fw.label}
              </div>
              <div style={{ 'font-size': '11px', color: 'var(--text-muted)', 'line-height': '1.4' }}>{fw.desc}</div>
            </button>)}
        </For>
      </div>

      {/* Generate form */}
      <form onSubmit={(e) => void handleGenerate(e)} style={{ display: 'flex', gap: '12px', 'align-items': 'flex-end', 'margin-bottom': '28px', 'flex-wrap': 'wrap' }}>
        <div>
          <label style={labelStyle}>Period Start</label>
          <input type="date" value={fromDate()} onInput={(e) => setFromDate(e.currentTarget.value)} style={inputStyle}/>
        </div>
        <div>
          <label style={labelStyle}>Period End</label>
          <input type="date" value={toDate()} onInput={(e) => setToDate(e.currentTarget.value)} style={inputStyle}/>
        </div>
        <button type="submit" disabled={generating()} style={{ padding: '8px 20px', 'border-radius': '6px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', 'font-weight': '600', 'font-size': '14px', opacity: generating() ? '0.7' : '1' }}>
          {generating() ? 'Generating…' : `Generate ${FRAMEWORKS.find((f) => f.id === framework())?.label ?? ''} Report`}
        </button>
      </form>

      <Show when={genError()}>
        <p style={{ color: '#991b1b', 'font-size': '13px', 'margin-bottom': '16px' }}>{genError()}</p>
      </Show>
      <Show when={error()}>
        <p style={{ color: '#991b1b', 'font-size': '13px', 'margin-bottom': '16px' }}>{error()}</p>
      </Show>

      {/* Reports table */}
      <h2 style={{ 'font-size': '16px', 'font-weight': '700', margin: '0 0 12px' }}>Generated Reports</h2>
      <Show when={!loading()} fallback={<p style={{ color: 'var(--text-muted)' }}>Loading…</p>}>
        <Show when={reports().length > 0} fallback={<p style={{ color: 'var(--text-muted)', 'font-size': '14px' }}>No reports yet. Generate your first report above.</p>}>
          <table style={{ width: '100%', 'border-collapse': 'collapse' }}>
            <thead>
              <tr>
                {['Framework', 'Period', 'Requested', 'Status', 'Actions'].map((h) => (<th style={{ 'text-align': 'left', padding: '8px 12px', 'font-size': '12px', 'font-weight': '600', color: 'var(--text-muted)', 'border-bottom': '1px solid var(--border)', 'text-transform': 'uppercase' }}>
                    {h}
                  </th>))}
              </tr>
            </thead>
            <tbody>
              <For each={reports()}>
                {(r) => (<tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', 'font-weight': '600', 'font-size': '14px' }}>{r.framework}</td>
                    <td style={{ padding: '10px 12px', 'font-size': '13px', color: 'var(--text-muted)' }}>
                      {new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 12px', 'font-size': '12px', color: 'var(--text-muted)' }}>
                      {new Date(r.requested_at).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: STATUS_COLOR[r.status] ?? 'var(--text)', 'font-weight': '600', 'font-size': '13px' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Show when={r.status === 'ready'}>
                        <button onClick={() => void downloadEvidence(r.report_id)} style={{ padding: '4px 10px', 'border-radius': '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', 'font-size': '12px', 'font-weight': '600' }}>
                          ↓ Evidence ZIP
                        </button>
                      </Show>
                    </td>
                  </tr>)}
              </For>
            </tbody>
          </table>
        </Show>
      </Show>
    </div>);
}
const labelStyle = { display: 'block', 'font-size': '12px', 'font-weight': '600', 'margin-bottom': '4px', color: 'var(--text-muted)' };
const inputStyle = { padding: '8px 10px', 'border-radius': '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', 'font-size': '14px' };
