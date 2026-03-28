/**
 * No-code rule builder — Phase 3 basic version.
 *
 * Lets analysts create detection rules using a form (no YAML required).
 * Supports single-field filter rules and count-threshold rules.
 * Submits to POST /api/v1/rules.
 */
import { createSignal, Show } from 'solid-js';
import Layout from '../components/layout/Layout';
import { apiClient } from '../api/client';
// ── Field / operator options ──────────────────────────────────────────────────
const FIELDS = [
    { value: 'src_ip', label: 'Source IP' },
    { value: 'dst_ip', label: 'Destination IP' },
    { value: 'dst_port', label: 'Destination Port' },
    { value: 'user_name', label: 'Username' },
    { value: 'process_name', label: 'Process Name' },
    { value: 'hostname', label: 'Hostname' },
    { value: 'event_type', label: 'Event Type' },
    { value: 'bytes_out', label: 'Bytes Out' },
    { value: 'bytes_in', label: 'Bytes In' },
    { value: 'parent_process', label: 'Parent Process' },
    { value: 'cmdline', label: 'Command Line' },
    { value: 'file_path', label: 'File Path' },
];
const OPERATORS = [
    { value: 'is', label: 'is exactly' },
    { value: 'contains', label: 'contains' },
    { value: 'startswith', label: 'starts with' },
    { value: 'endswith', label: 'ends with' },
    { value: 'regex', label: 'matches regex' },
    { value: 'gt', label: 'greater than' },
    { value: 'lt', label: 'less than' },
    { value: 'cidr', label: 'in CIDR range' },
];
const SEVERITIES = ['P1', 'P2', 'P3', 'P4', 'P5'];
const SEV_COLORS = {
    P1: 'var(--sev-p1)',
    P2: 'var(--sev-p2)',
    P3: 'var(--sev-p3)',
    P4: 'var(--sev-p4)',
    P5: 'var(--sev-p5)',
};
const MITRE_TACTICS = [
    'initial-access', 'execution', 'persistence', 'privilege-escalation',
    'defense-evasion', 'credential-access', 'discovery', 'lateral-movement',
    'collection', 'command-and-control', 'exfiltration', 'impact', 'reconnaissance',
];
export default function RuleBuilderPage() {
    const [name, setName] = createSignal('');
    const [severity, setSeverity] = createSignal('P3');
    const [mitreTactic, setMitreTactic] = createSignal('');
    const [mode, setMode] = createSignal('filter');
    const [field, setField] = createSignal('src_ip');
    const [operator, setOperator] = createSignal('is');
    const [value, setValue] = createSignal('');
    const [thresholdCount, setThresholdCount] = createSignal(5);
    const [windowSeconds, setWindowSeconds] = createSignal(60);
    const [groupBy, setGroupBy] = createSignal('user_name');
    const [submitting, setSubmitting] = createSignal(false);
    const [success, setSuccess] = createSignal(null);
    const [error, setError] = createSignal(null);
    // Live SIGMA-like preview
    const preview = () => {
        const lines = [
            `title: ${name() || '<rule name>'}`,
            `status: experimental`,
            `level: ${severity().toLowerCase()}`,
            ...(mitreTactic() ? [`tags:\n  - attack.${mitreTactic()}`] : []),
            `detection:`,
            `  selection:`,
            `    ${field()}|${operator()}: '${value() || '<value>'}'`,
        ];
        if (mode() === 'threshold') {
            lines.push(`  condition: selection | count(${field()}) by ${groupBy()} > ${thresholdCount()}`, `timeframe: ${windowSeconds()}s`);
        }
        else {
            lines.push(`  condition: selection`);
        }
        return lines.join('\n');
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!name().trim()) {
            setError('Rule name is required.');
            return;
        }
        if (!value().trim()) {
            setError('Match value is required.');
            return;
        }
        setSubmitting(true);
        try {
            const body = {
                name: name().trim(),
                rule_type: mode(),
                severity: severity(),
                mitre_tactic: mitreTactic() || undefined,
                config: mode() === 'threshold'
                    ? {
                        field: field(),
                        operator: operator(),
                        value: value().trim(),
                        threshold: thresholdCount(),
                        window_seconds: windowSeconds(),
                        group_by: groupBy(),
                    }
                    : {
                        field: field(),
                        operator: operator(),
                        value: value().trim(),
                    },
            };
            await apiClient.createRule(body);
            setSuccess('Rule created successfully.');
            // Reset form
            setName('');
            setValue('');
            setMitreTactic('');
            setSeverity('P3');
            setMode('filter');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create rule.');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (<Layout title="Rule Builder">
      <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '24px', 'max-width': '1100px' }}>

        {/* ── Form ── */}
        <div>
          <form onSubmit={(e) => void handleSubmit(e)}>

            {/* Name */}
            <Field label="Rule Name">
              <input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Suspicious Login from Unknown IP" style={inputStyle} required/>
            </Field>

            {/* Severity */}
            <Field label="Severity">
              <div style={{ display: 'flex', gap: '8px' }}>
                {SEVERITIES.map((s) => (<button type="button" onClick={() => setSeverity(s)} style={{
                padding: '5px 12px',
                'border-radius': '4px',
                'font-size': '12px',
                'font-weight': '600',
                cursor: 'pointer',
                border: '1px solid',
                'border-color': severity() === s ? SEV_COLORS[s] : 'var(--border)',
                background: severity() === s
                    ? `color-mix(in srgb, ${SEV_COLORS[s]} 20%, transparent)`
                    : 'transparent',
                color: severity() === s ? SEV_COLORS[s] : 'var(--text-muted)',
            }}>
                    {s}
                  </button>))}
              </div>
            </Field>

            {/* Rule mode */}
            <Field label="Detection Type">
              <div style={{ display: 'flex', gap: '8px' }}>
                {['filter', 'threshold'].map((m) => (<button type="button" onClick={() => setMode(m)} style={{
                padding: '6px 16px',
                'border-radius': '6px',
                'font-size': '13px',
                cursor: 'pointer',
                border: '1px solid',
                'border-color': mode() === m ? 'var(--primary)' : 'var(--border)',
                background: mode() === m ? 'var(--primary-dim)' : 'transparent',
                color: mode() === m ? 'var(--primary)' : 'var(--text-muted)',
            }}>
                    {m === 'filter' ? 'Field Match' : 'Count Threshold'}
                  </button>))}
              </div>
              <p style={{ 'font-size': '11px', color: 'var(--text-dim)', 'margin-top': '6px' }}>
                {mode() === 'filter'
            ? 'Alert when any event matches the field condition.'
            : 'Alert when matching events exceed a count within a time window.'}
              </p>
            </Field>

            {/* Field + Operator + Value */}
            <Field label="Condition">
              <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
                <select value={field()} onChange={(e) => setField(e.currentTarget.value)} style={selectStyle}>
                  {FIELDS.map((f) => <option value={f.value}>{f.label}</option>)}
                </select>
                <select value={operator()} onChange={(e) => setOperator(e.currentTarget.value)} style={selectStyle}>
                  {OPERATORS.map((o) => <option value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <input value={value()} onInput={(e) => setValue(e.currentTarget.value)} placeholder="Match value…" style={{ ...inputStyle, 'margin-top': '8px' }}/>
            </Field>

            {/* Threshold config */}
            <Show when={mode() === 'threshold'}>
              <Field label="Threshold">
                <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
                  <div>
                    <label style={microLabel}>Count exceeds</label>
                    <input type="number" value={thresholdCount()} min={1} onInput={(e) => setThresholdCount(Number(e.currentTarget.value))} style={{ ...inputStyle, width: '80px' }}/>
                  </div>
                  <div>
                    <label style={microLabel}>Within (seconds)</label>
                    <input type="number" value={windowSeconds()} min={10} onInput={(e) => setWindowSeconds(Number(e.currentTarget.value))} style={{ ...inputStyle, width: '100px' }}/>
                  </div>
                  <div>
                    <label style={microLabel}>Grouped by</label>
                    <select value={groupBy()} onChange={(e) => setGroupBy(e.currentTarget.value)} style={selectStyle}>
                      {FIELDS.map((f) => <option value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>
              </Field>
            </Show>

            {/* MITRE tactic */}
            <Field label="MITRE Tactic (optional)">
              <select value={mitreTactic()} onChange={(e) => setMitreTactic(e.currentTarget.value)} style={selectStyle}>
                <option value="">— none —</option>
                {MITRE_TACTICS.map((t) => <option value={t}>{t}</option>)}
              </select>
            </Field>

            {/* Feedback */}
            <Show when={success()}>
              <div style={feedbackStyle('var(--success)')}>
                {success()}
              </div>
            </Show>
            <Show when={error()}>
              <div style={feedbackStyle('var(--danger)')}>
                {error()}
              </div>
            </Show>

            <button type="submit" disabled={submitting()} style={{
            'margin-top': '8px',
            padding: '10px 24px',
            background: submitting() ? 'var(--surface2)' : 'var(--primary)',
            border: 'none',
            'border-radius': '8px',
            color: 'white',
            'font-size': '14px',
            'font-weight': '600',
            cursor: submitting() ? 'not-allowed' : 'pointer',
        }}>
              {submitting() ? 'Creating…' : 'Create Rule'}
            </button>
          </form>
        </div>

        {/* ── SIGMA Preview ── */}
        <div>
          <p style={{ 'font-size': '12px', 'font-weight': '500', color: 'var(--text-muted)', 'margin-bottom': '10px', 'text-transform': 'uppercase', 'letter-spacing': '0.06em' }}>
            Generated SIGMA Rule
          </p>
          <pre style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            'border-radius': '8px',
            padding: '16px',
            'font-family': 'var(--font-mono)',
            'font-size': '12px',
            'line-height': '1.6',
            color: 'var(--text)',
            'white-space': 'pre-wrap',
            'word-break': 'break-word',
            'overflow-x': 'auto',
        }}>
            {preview()}
          </pre>

          <div style={{
            'margin-top': '16px',
            padding: '12px 14px',
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            'border-radius': '8px',
            'font-size': '12px',
            color: 'var(--text-muted)',
            'line-height': '1.5',
        }}>
            The rule is stored internally and compiled to ClickHouse SQL for real-time
            matching. You can also import raw SIGMA YAML via{' '}
            <code style={{ 'font-family': 'var(--font-mono)', color: 'var(--primary)' }}>
              POST /api/v1/rules/import/sigma
            </code>.
          </div>
        </div>

      </div>
    </Layout>);
}
// ── Local helpers ─────────────────────────────────────────────────────────────
function Field(props) {
    return (<div style={{ 'margin-bottom': '20px' }}>
      <label style={{ display: 'block', 'font-size': '12px', 'font-weight': '500', color: 'var(--text-muted)', 'margin-bottom': '8px' }}>
        {props.label}
      </label>
      {props.children}
    </div>);
}
const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    'border-radius': '6px',
    color: 'var(--text)',
    'font-size': '13px',
    outline: 'none',
    'box-sizing': 'border-box',
};
const selectStyle = {
    padding: '8px 10px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    'border-radius': '6px',
    color: 'var(--text)',
    'font-size': '13px',
    outline: 'none',
    cursor: 'pointer',
};
const microLabel = {
    display: 'block',
    'font-size': '11px',
    color: 'var(--text-dim)',
    'margin-bottom': '4px',
};
const feedbackStyle = (color) => ({
    padding: '10px 14px',
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
    'border-radius': '6px',
    'font-size': '13px',
    color,
    'margin-bottom': '12px',
});
