/**
 * Login page.
 *
 * Two-step flow:
 *   1. Email + password submission.
 *   2. TOTP entry (shown after first step, or simultaneously if the
 *      server returns a TOTP_REQUIRED error code).
 *
 * On success, redirects to the dashboard. On auth error, displays the
 * error inline without clearing the password field.
 */

import type { JSX } from 'solid-js';
import { createEffect, createSignal, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../stores/auth';

export default function LoginPage(): JSX.Element {
  const { authState, login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [totp, setTotp] = createSignal('');
  const [showTotp, setShowTotp] = createSignal(false);

  // Redirect to dashboard if already authenticated.
  createEffect(() => {
    if (isAuthenticated()) {
      void navigate('/', { replace: true });
    }
  });

  const handleSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    try {
      await login({
        email: email(),
        password: password(),
        totp: showTotp() && totp().length > 0 ? totp() : undefined,
      });
      // On success, the createEffect above will navigate to /.
    } catch (err) {
      // If the error is TOTP_REQUIRED, show the TOTP field without
      // clearing existing inputs.
      const code = (err as { code?: string }).code;
      if (code === 'TOTP_REQUIRED' || code === 'MFA_REQUIRED') {
        setShowTotp(true);
      }
    }
  };

  const inputStyle: JSX.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    'border-radius': 'var(--radius-md)',
    color: 'var(--text)',
    'font-size': '14px',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  };

  const labelStyle: JSX.CSSProperties = {
    display: 'block',
    'font-size': '12px',
    'font-weight': '500',
    color: 'var(--text-muted)',
    'margin-bottom': '6px',
    'text-transform': 'uppercase',
    'letter-spacing': '0.05em',
  };

  return (
    <div
      style={{
        'min-height': '100vh',
        background: 'var(--bg)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          'max-width': '400px',
        }}
      >
        {/* Logo */}
        <div style={{ 'text-align': 'center', 'margin-bottom': '40px' }}>
          <div
            style={{
              display: 'inline-flex',
              'align-items': 'center',
              'justify-content': 'center',
              width: '48px',
              height: '48px',
              background: 'var(--primary)',
              'border-radius': 'var(--radius-lg)',
              'font-weight': '800',
              'font-size': '20px',
              color: '#fff',
              'margin-bottom': '16px',
            }}
          >
            K
          </div>
          <h1 style={{ 'font-size': '22px', 'font-weight': '700', 'margin-bottom': '4px' }}>
            Welcome to KRON
          </h1>
          <p style={{ color: 'var(--text-muted)', 'font-size': '14px' }}>
            Security Intelligence Platform
          </p>
        </div>

        {/* Login card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            'border-radius': 'var(--radius-xl)',
            padding: '32px',
          }}
        >
          <form onSubmit={(e) => void handleSubmit(e)} novalidate>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px' }}>
              {/* Email */}
              <div>
                <label for="email" style={labelStyle}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autocomplete="email"
                  required
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="analyst@organisation.in"
                  style={inputStyle}
                  disabled={authState.isLoading}
                  aria-required="true"
                />
              </div>

              {/* Password */}
              <div>
                <label for="password" style={labelStyle}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autocomplete="current-password"
                  required
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  placeholder="••••••••••••"
                  style={inputStyle}
                  disabled={authState.isLoading}
                  aria-required="true"
                />
              </div>

              {/* TOTP — shown after first auth step or on TOTP_REQUIRED error */}
              <Show when={showTotp()}>
                <div>
                  <label for="totp" style={labelStyle}>
                    Authenticator code
                  </label>
                  <input
                    id="totp"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxlength="6"
                    value={totp()}
                    onInput={(e) => setTotp(e.currentTarget.value)}
                    placeholder="000000"
                    style={{ ...inputStyle, 'letter-spacing': '0.3em', 'text-align': 'center', 'font-family': 'var(--font-mono)' }}
                    disabled={authState.isLoading}
                    aria-label="6-digit TOTP code from your authenticator app"
                  />
                  <p style={{ 'font-size': '11px', color: 'var(--text-muted)', 'margin-top': '4px' }}>
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              </Show>

              {/* Error message */}
              <Show when={authState.error !== null}>
                <div
                  role="alert"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--danger)',
                    'border-radius': 'var(--radius-md)',
                    padding: '10px 12px',
                    'font-size': '13px',
                    color: '#fca5a5',
                  }}
                >
                  {authState.error}
                </div>
              </Show>

              {/* Submit button */}
              <button
                type="submit"
                disabled={authState.isLoading || email().length === 0 || password().length === 0}
                style={{
                  padding: '11px 16px',
                  background: authState.isLoading ? 'var(--primary-dim)' : 'var(--primary)',
                  color: '#fff',
                  'border-radius': 'var(--radius-md)',
                  'font-size': '14px',
                  'font-weight': '600',
                  border: 'none',
                  cursor: authState.isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-fast)',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  gap: '8px',
                }}
                aria-live="polite"
              >
                <Show when={authState.isLoading}>
                  <SpinnerIcon />
                </Show>
                {authState.isLoading ? 'Signing in…' : showTotp() ? 'Verify & Sign in' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>

        <p style={{ 'text-align': 'center', 'margin-top': '24px', 'font-size': '12px', color: 'var(--text-dim)' }}>
          KRON v0.1 · On-premise SIEM · Data never leaves your network
        </p>
      </div>
    </div>
  );
}

/** Small inline spinner used on the login button during loading state. */
function SpinnerIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" opacity="0.25" />
      <path d="M21 12a9 9 0 0 1-9 9" />
    </svg>
  );
}
