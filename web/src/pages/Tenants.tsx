/**
 * Tenants — MSSP portal page.
 *
 * Visible only to super_admin users. Shows a table of all tenants with
 * status badges and allows creating new tenants via an inline wizard.
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import { apiClient } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tenant {
  tenant_id: string;
  name: string;
  contact_email: string;
  whatsapp_number: string | null;
  compliance_frameworks: string[];
  language: string;
  created_at: string;
  status: 'active' | 'suspended' | 'offboarded';
}

interface CreateTenantForm {
  name: string;
  contact_email: string;
  whatsapp_number: string;
  compliance_frameworks: string[];
  language: string;
}

const FRAMEWORKS = [
  { id: 'cert_in', label: 'CERT-In' },
  { id: 'dpdp', label: 'DPDP Act' },
  { id: 'rbi', label: 'RBI IS' },
  { id: 'sebi_cscrf', label: 'SEBI CSCRF' },
];

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
  { id: 'mr', label: 'Marathi' },
];

const STATUS_STYLES: Record<string, string> = {
  active: 'background:#d1fae5;color:#065f46',
  suspended: 'background:#fef3c7;color:#92400e',
  offboarded: 'background:#fee2e2;color:#991b1b',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Tenants() {
  const [tenants, setTenants] = createSignal<Tenant[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [showCreate, setShowCreate] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [createError, setCreateError] = createSignal('');

  const [form, setForm] = createSignal<CreateTenantForm>({
    name: '',
    contact_email: '',
    whatsapp_number: '',
    compliance_frameworks: ['cert_in'],
    language: 'en',
  });

  onMount(() => void loadTenants());

  async function loadTenants() {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.listTenants<Tenant[]>();
      setTenants(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  function toggleFramework(id: string) {
    const current = form().compliance_frameworks;
    setForm((f) => ({
      ...f,
      compliance_frameworks: current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    }));
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    const f = form();
    if (!f.name.trim() || !f.contact_email.trim()) {
      setCreateError('Name and contact email are required.');
      return;
    }
    if (f.compliance_frameworks.length === 0) {
      setCreateError('Select at least one compliance framework.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await apiClient.createTenant({
        name: f.name.trim(),
        contact_email: f.contact_email.trim(),
        whatsapp_number: f.whatsapp_number.trim() || null,
        compliance_frameworks: f.compliance_frameworks,
        language: f.language,
      });
      setShowCreate(false);
      setForm({ name: '', contact_email: '', whatsapp_number: '', compliance_frameworks: ['cert_in'], language: 'en' });
      await loadTenants();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: '24px', 'max-width': '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '24px' }}>
        <div>
          <h1 style={{ 'font-size': '22px', 'font-weight': '700', margin: '0 0 4px' }}>Tenants</h1>
          <p style={{ color: 'var(--text-muted)', 'font-size': '13px', margin: 0 }}>
            MSSP portal — manage customer tenants, compliance frameworks, and configurations.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            'border-radius': '6px',
            cursor: 'pointer',
            'font-size': '14px',
            'font-weight': '600',
          }}
        >
          + New Tenant
        </button>
      </div>

      {/* Error */}
      <Show when={error()}>
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', 'border-radius': '6px', 'margin-bottom': '16px' }}>
          {error()}
        </div>
      </Show>

      {/* Tenant table */}
      <Show
        when={!loading()}
        fallback={
          <div style={{ color: 'var(--text-muted)', 'text-align': 'center', padding: '48px' }}>
            Loading tenants…
          </div>
        }
      >
        <Show
          when={tenants().length > 0}
          fallback={
            <div style={{ 'text-align': 'center', padding: '48px', color: 'var(--text-muted)' }}>
              No tenants yet. Create your first tenant to get started.
            </div>
          }
        >
          <table style={{ width: '100%', 'border-collapse': 'collapse' }}>
            <thead>
              <tr>
                {(['Organisation', 'Contact', 'Frameworks', 'Language', 'Created', 'Status'] as const).map((h) => (
                  <th style={{ 'text-align': 'left', padding: '10px 12px', 'font-size': '12px', 'font-weight': '600', color: 'var(--text-muted)', 'border-bottom': '1px solid var(--border)', 'text-transform': 'uppercase', 'letter-spacing': '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <For each={tenants()}>
                {(tenant) => (
                  <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ 'font-weight': '600', 'font-size': '14px' }}>{tenant.name}</div>
                      <div style={{ 'font-size': '11px', color: 'var(--text-muted)', 'font-family': 'var(--font-mono)' }}>
                        {tenant.tenant_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td style={{ padding: '12px', 'font-size': '13px' }}>
                      <div>{tenant.contact_email}</div>
                      <Show when={tenant.whatsapp_number}>
                        <div style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>{tenant.whatsapp_number}</div>
                      </Show>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
                        <For each={tenant.compliance_frameworks}>
                          {(fw) => (
                            <span style={{ background: 'var(--surface2)', padding: '2px 6px', 'border-radius': '4px', 'font-size': '11px', 'font-weight': '600' }}>
                              {fw.toUpperCase().replace('_', '-')}
                            </span>
                          )}
                        </For>
                      </div>
                    </td>
                    <td style={{ padding: '12px', 'font-size': '13px' }}>{tenant.language.toUpperCase()}</td>
                    <td style={{ padding: '12px', 'font-size': '12px', color: 'var(--text-muted)' }}>
                      {new Date(tenant.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ ...parseStyle(STATUS_STYLES[tenant.status] ?? ''), padding: '3px 8px', 'border-radius': '4px', 'font-size': '12px', 'font-weight': '600' }}>
                        {tenant.status}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Show>

      {/* Create tenant modal */}
      <Show when={showCreate()}>
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': '100' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{ background: 'var(--surface)', padding: '32px', 'border-radius': '12px', width: '480px', 'max-width': '90vw' }}>
            <h2 style={{ margin: '0 0 20px', 'font-size': '18px', 'font-weight': '700' }}>New Tenant</h2>

            <form onSubmit={(e) => void handleCreate(e)}>
              <Field label="Organisation Name *">
                <input
                  type="text"
                  value={form().name}
                  onInput={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
                  placeholder="Acme Corp Pvt. Ltd."
                  style={inputStyle}
                />
              </Field>

              <Field label="Contact Email *">
                <input
                  type="email"
                  value={form().contact_email}
                  onInput={(e) => setForm((f) => ({ ...f, contact_email: e.currentTarget.value }))}
                  placeholder="ciso@acme.example"
                  style={inputStyle}
                />
              </Field>

              <Field label="WhatsApp Number (E.164)">
                <input
                  type="text"
                  value={form().whatsapp_number}
                  onInput={(e) => setForm((f) => ({ ...f, whatsapp_number: e.currentTarget.value }))}
                  placeholder="+919876543210"
                  style={inputStyle}
                />
              </Field>

              <Field label="Compliance Frameworks *">
                <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'margin-top': '6px' }}>
                  <For each={FRAMEWORKS}>
                    {(fw) => {
                      const active = () => form().compliance_frameworks.includes(fw.id);
                      return (
                        <button
                          type="button"
                          onClick={() => toggleFramework(fw.id)}
                          style={{
                            padding: '4px 10px',
                            'border-radius': '4px',
                            border: active() ? '2px solid var(--accent)' : '2px solid var(--border)',
                            background: active() ? 'var(--accent)' : 'transparent',
                            color: active() ? '#fff' : 'var(--text)',
                            cursor: 'pointer',
                            'font-size': '13px',
                            'font-weight': '600',
                          }}
                        >
                          {fw.label}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Field>

              <Field label="Language">
                <select
                  value={form().language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.currentTarget.value }))}
                  style={inputStyle}
                >
                  <For each={LANGUAGES}>
                    {(lang) => <option value={lang.id}>{lang.label}</option>}
                  </For>
                </select>
              </Field>

              <Show when={createError()}>
                <p style={{ color: '#991b1b', 'font-size': '13px', margin: '8px 0' }}>{createError()}</p>
              </Show>

              <div style={{ display: 'flex', gap: '12px', 'margin-top': '24px', 'justify-content': 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{ padding: '8px 16px', 'border-radius': '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', 'font-size': '14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating()}
                  style={{ padding: '8px 20px', 'border-radius': '6px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', 'font-size': '14px', 'font-weight': '600', opacity: creating() ? '0.7' : '1' }}
                >
                  {creating() ? 'Creating…' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field(props: { label: string; children: any }) {
  return (
    <div style={{ 'margin-bottom': '16px' }}>
      <label style={{ display: 'block', 'font-size': '13px', 'font-weight': '600', 'margin-bottom': '6px', color: 'var(--text)' }}>
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  'border-radius': '6px',
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  'font-size': '14px',
  'box-sizing': 'border-box' as const,
};

/** Converts a CSS string like "background:#fff;color:#000" into a style object. */
function parseStyle(css: string): Record<string, string> {
  return Object.fromEntries(
    css.split(';').filter(Boolean).map((rule) => {
      const [k, v] = rule.split(':');
      return [k?.trim() ?? '', v?.trim() ?? ''];
    })
  );
}
