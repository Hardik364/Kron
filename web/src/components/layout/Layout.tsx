/**
 * Layout
 *
 * Authenticated page wrapper: sidebar on the left, scrollable main
 * content area on the right. Redirects unauthenticated users to /login.
 */

import type { JSX } from 'solid-js';
import { createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import Sidebar from './Sidebar';
import { useAuth } from '../../stores/auth';

interface LayoutProps {
  children: JSX.Element;
  /** Page title shown in the top header bar. */
  title?: string;
}

/**
 * Authenticated application shell.
 *
 * @example
 * <Layout title="Alert Queue">
 *   <AlertsPage />
 * </Layout>
 */
export default function Layout(props: LayoutProps): JSX.Element {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  createEffect(() => {
    if (!isAuthenticated()) {
      void navigate('/login', { replace: true });
    }
  });

  return (
    <div
      style={{
        display: 'flex',
        'min-height': '100vh',
        background: 'var(--bg)',
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: '1',
          display: 'flex',
          'flex-direction': 'column',
          'min-width': '0',
          'overflow-x': 'hidden',
        }}
      >
        {/* Top header bar */}
        {props.title && (
          <header
            style={{
              padding: '16px 24px',
              'border-bottom': '1px solid var(--border)',
              background: 'var(--surface)',
              'flex-shrink': '0',
            }}
          >
            <h1 style={{ 'font-size': '16px', 'font-weight': '600', color: 'var(--text)' }}>
              {props.title}
            </h1>
          </header>
        )}

        {/* Page content */}
        <main
          style={{
            flex: '1',
            padding: '24px',
            'overflow-y': 'auto',
          }}
        >
          {props.children}
        </main>
      </div>
    </div>
  );
}
