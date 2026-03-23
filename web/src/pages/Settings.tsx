/**
 * Settings page.
 *
 * Tenant-level configuration: notification channels (WhatsApp, SMS, email),
 * alert thresholds, and session/security preferences.
 *
 * Note: this page currently manages local form state only. Persistence
 * requires a settings API endpoint — tracked in TODO(#TBD, hardik, v1.1).
 */

import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import Layout from '../components/layout/Layout';
import { useAuth } from '../stores/auth';

const labelStyle: JSX.CSSProperties = {
  display: 'block',
  'font-size': '12px',
  'font-weight': '500',
  color: 'var(--text-muted)',
  'margin-bottom': '6px',
  'text-transform': 'uppercase',
  'letter-spacing': '0.05em',
};

const inputStyle: JSX.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  'border-radius': 'var(--radius-md)',
  color: 'var(--text)',
  'font-size': '14px',
  outline: 'none',
  'box-sizing': 'border-box',
  transition: 'border-color var(--transition-fast)',
};

const cardStyle: JSX.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  'border-radius': 'var(--radius-lg)',
  padding: '24px',
};

const sectionHeaderStyle: JSX.CSSProperties = {
  'font-size': '13px',
  'font-weight': '600',
  color: 'var(--text)',
  'margin-bottom': '16px',
  'padding-bottom': '10px',
  'border-bottom': '1px solid var(--border)',
};

function FieldGroup(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  hint?: string;
}): JSX.Element {
  return (
    <div>
      <label for={props.id} style={labelStyle}>
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder={props.placeholder}
        style={inputStyle}
      />
      <Show when={props.hint}>
        <p style={{ 'font-size': '11px', color: 'var(--text-muted)', 'margin-top': '4px' }}>
          {props.hint}
        </p>
      </Show>
    </div>
  );
}

/**
 * Tenant settings form — notification channels and alert configuration.
 */
export default function SettingsPage(): JSX.Element {
  const { authState } = useAuth();

  // Notification channels
  const [whatsappNumber, setWhatsappNumber] = createSignal('');
  const [smsNumber, setSmsNumber] = createSignal('');
  const [alertEmail, setAlertEmail] = createSignal('');
  const [orgName, setOrgName] = createSignal('');

  // Alert thresholds
  const [p1Threshold, setP1Threshold] = createSignal('80');
  const [p2Threshold, setP2Threshold] = createSignal('60');

  // Save state
  const [saving, setSaving] = createSignal(false);
  const [saveMessage, setSaveMessage] = createSignal<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  /**
   * Saves settings to the backend.
   * TODO(#TBD, hardik, v1.1): wire up to PUT /api/v1/tenant/settings once endpoint is implemented.
   */
  const handleSave = async (e: Event): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    // Validate threshold values are numbers in the valid range.
    const p1 = Number(p1Threshold());
    const p2 = Number(p2Threshold());
    if (isNaN(p1) || p1 < 0 || p1 > 100 || isNaN(p2) || p2 < 0 || p2 > 100) {
      setSaveMessage({ type: 'err', text: 'Risk score thresholds must be numbers between 0 and 100.' });
      setSaving(false);
      return;
    }

    try {
      // TODO(#TBD, hardik, v1.1): replace with real API call
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      setSaveMessage({ type: 'ok', text: 'Settings saved successfully.' });
    } catch (err) {
      setSaveMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Settings">
      <div style={{ 'max-width': '680px' }}>
        <form onSubmit={(e) => void handleSave(e)}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px' }}>
            {/* Organisation */}
            <div style={cardStyle}>
              <h2 style={sectionHeaderStyle}>Organisation</h2>
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
                <FieldGroup
                  id="org-name"
                  label="Organisation Name"
                  value={orgName()}
                  onInput={setOrgName}
                  placeholder="Acme Corp"
                />
                <div
                  style={{
                    'font-size': '12px',
                    color: 'var(--text-muted)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    'border-radius': 'var(--radius-md)',
                    padding: '10px 12px',
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', 'text-transform': 'uppercase', 'font-size': '11px', 'letter-spacing': '0.05em' }}>
                    Tenant ID
                  </span>
                  <p style={{ 'font-family': 'var(--font-mono)', 'font-size': '12px', 'margin-top': '4px', color: 'var(--text)' }}>
                    {authState.tenantId ?? '—'}
                  </p>
                </div>
                <div
                  style={{
                    'font-size': '12px',
                    color: 'var(--text-muted)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    'border-radius': 'var(--radius-md)',
                    padding: '10px 12px',
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', 'text-transform': 'uppercase', 'font-size': '11px', 'letter-spacing': '0.05em' }}>
                    Your Role
                  </span>
                  <p style={{ 'font-size': '13px', 'margin-top': '4px', color: 'var(--text)', 'text-transform': 'capitalize' }}>
                    {authState.role ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Notification Channels */}
            <div style={cardStyle}>
              <h2 style={sectionHeaderStyle}>Notification Channels</h2>
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
                <FieldGroup
                  id="whatsapp-number"
                  label="WhatsApp Number (P1 / P2 alerts)"
                  type="tel"
                  value={whatsappNumber()}
                  onInput={setWhatsappNumber}
                  placeholder="+91 98765 43210"
                  hint="International format. P1 alerts are sent immediately; P2 alerts are batched every 15 min."
                />
                <FieldGroup
                  id="sms-number"
                  label="SMS Number (P1 alerts only)"
                  type="tel"
                  value={smsNumber()}
                  onInput={setSmsNumber}
                  placeholder="+91 98765 43210"
                  hint="SMS is used as fallback when WhatsApp delivery fails for P1 alerts."
                />
                <FieldGroup
                  id="alert-email"
                  label="Alert Email"
                  type="email"
                  value={alertEmail()}
                  onInput={setAlertEmail}
                  placeholder="soc@organisation.in"
                  hint="P1–P3 alert summaries are emailed at the end of each 1-hour window."
                />
              </div>
            </div>

            {/* Alert Thresholds */}
            <div style={cardStyle}>
              <h2 style={sectionHeaderStyle}>Alert Risk Score Thresholds</h2>
              <p style={{ 'font-size': '13px', color: 'var(--text-muted)', 'margin-bottom': '16px' }}>
                Alerts with a risk score at or above these thresholds are escalated to the
                corresponding priority level.
              </p>
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '1fr 1fr',
                  gap: '16px',
                }}
              >
                <FieldGroup
                  id="p1-threshold"
                  label="P1 Critical Threshold (0–100)"
                  type="number"
                  value={p1Threshold()}
                  onInput={setP1Threshold}
                  placeholder="80"
                  hint="Risk score ≥ this value triggers a P1 alert."
                />
                <FieldGroup
                  id="p2-threshold"
                  label="P2 High Threshold (0–100)"
                  type="number"
                  value={p2Threshold()}
                  onInput={setP2Threshold}
                  placeholder="60"
                  hint="Risk score ≥ this value triggers a P2 alert."
                />
              </div>
            </div>

            {/* Feedback */}
            <Show when={saveMessage() !== null}>
              <div
                role="status"
                aria-live="polite"
                style={{
                  padding: '10px 14px',
                  'border-radius': 'var(--radius-md)',
                  'font-size': '13px',
                  background:
                    saveMessage()?.type === 'ok'
                      ? 'rgba(16,185,129,0.1)'
                      : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${saveMessage()?.type === 'ok' ? 'rgba(16,185,129,0.4)' : 'var(--danger)'}`,
                  color: saveMessage()?.type === 'ok' ? 'var(--success)' : '#fca5a5',
                }}
              >
                {saveMessage()?.text}
              </div>
            </Show>

            {/* Save button */}
            <button
              type="submit"
              disabled={saving()}
              style={{
                'align-self': 'flex-start',
                padding: '10px 28px',
                background: saving() ? 'var(--primary-dim)' : 'var(--primary)',
                border: 'none',
                'border-radius': 'var(--radius-md)',
                color: 'white',
                'font-size': '14px',
                'font-weight': '600',
                cursor: saving() ? 'not-allowed' : 'pointer',
                transition: 'background var(--transition-fast)',
              }}
            >
              {saving() ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
