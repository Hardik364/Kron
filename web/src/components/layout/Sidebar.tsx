/**
 * Sidebar navigation component.
 *
 * Fixed left panel with the KRON logo, primary nav links, and a
 * bottom-pinned logout button. Shows keyboard shortcut hints.
 * Active route is highlighted via the @solidjs/router A component.
 */

import type { JSX } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useAuth } from '../../stores/auth';

interface NavItem {
  href: string;
  label: string;
  shortcut: string;
  icon: JSX.Element;
}

/** SVG icon components — inline for zero extra dependencies. */
function IconDashboard(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconAlerts(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconEvents(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconMitre(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function IconSettings(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogout(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', shortcut: 'G D', icon: <IconDashboard /> },
  { href: '/alerts', label: 'Alerts', shortcut: 'G A', icon: <IconAlerts /> },
  { href: '/events', label: 'Events', shortcut: 'G E', icon: <IconEvents /> },
  { href: '/mitre', label: 'MITRE', shortcut: 'G M', icon: <IconMitre /> },
  { href: '/settings', label: 'Settings', shortcut: 'G S', icon: <IconSettings /> },
];

/**
 * Fixed-width sidebar with logo, navigation, and logout.
 *
 * Navigation links use @solidjs/router's `A` component which automatically
 * applies an `active` class when the route matches.
 */
export default function Sidebar(): JSX.Element {
  const { authState, logout } = useAuth();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <nav
      style={{
        width: 'var(--sidebar-width)',
        'min-width': 'var(--sidebar-width)',
        height: '100vh',
        position: 'sticky',
        top: '0',
        display: 'flex',
        'flex-direction': 'column',
        background: 'var(--surface)',
        'border-right': '1px solid var(--border)',
        'overflow-y': 'auto',
        'flex-shrink': '0',
      }}
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 16px 16px',
          'border-bottom': '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              background: 'var(--primary)',
              'border-radius': 'var(--radius-md)',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-weight': '800',
              'font-size': '14px',
              color: '#fff',
              'flex-shrink': '0',
            }}
          >
            K
          </div>
          <div>
            <p style={{ 'font-weight': '700', 'font-size': '15px', 'line-height': '1.2', color: 'var(--text)' }}>
              KRON
            </p>
            <p style={{ 'font-size': '10px', color: 'var(--text-muted)', 'line-height': '1.2' }}>
              Security Intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <ul
        role="list"
        style={{
          padding: '8px 0',
          flex: '1',
          display: 'flex',
          'flex-direction': 'column',
          gap: '2px',
        }}
      >
        {NAV_ITEMS.map((item) => (
          <li>
            <A
              href={item.href}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '10px',
                padding: '9px 16px',
                'border-radius': '0',
                color: isActive(item.href) ? 'var(--primary)' : 'var(--text-muted)',
                background: isActive(item.href) ? 'var(--primary-dim)' : 'transparent',
                'border-left': isActive(item.href) ? '2px solid var(--primary)' : '2px solid transparent',
                'font-size': '13px',
                'font-weight': isActive(item.href) ? '500' : '400',
                transition: 'color var(--transition-fast), background var(--transition-fast)',
                'text-decoration': 'none',
              }}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <span style={{ 'flex-shrink': '0' }}>{item.icon}</span>
              <span style={{ flex: '1' }}>{item.label}</span>
              <span
                style={{
                  'font-size': '10px',
                  color: 'var(--text-dim)',
                  'font-family': 'var(--font-mono)',
                  background: 'var(--surface2)',
                  padding: '1px 4px',
                  'border-radius': 'var(--radius-sm)',
                  'border': '1px solid var(--border)',
                }}
                aria-hidden="true"
              >
                {item.shortcut}
              </span>
            </A>
          </li>
        ))}
      </ul>

      {/* Bottom section: user info + logout */}
      <div
        style={{
          padding: '12px 16px',
          'border-top': '1px solid var(--border)',
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
        }}
      >
        <div>
          <p style={{ 'font-size': '12px', color: 'var(--text-muted)' }} class="truncate">
            {authState.role ?? '—'}
          </p>
          <p style={{ 'font-size': '10px', color: 'var(--text-dim)' }} class="truncate">
            Tenant: {authState.tenantId ?? '—'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
            'font-size': '12px',
            color: 'var(--text-muted)',
            padding: '6px 8px',
            'border-radius': 'var(--radius-sm)',
            background: 'transparent',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'color var(--transition-fast), border-color var(--transition-fast)',
            width: '100%',
          }}
          aria-label="Log out"
        >
          <IconLogout />
          Log out
        </button>
      </div>
    </nav>
  );
}
