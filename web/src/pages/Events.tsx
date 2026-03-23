/**
 * Events page.
 *
 * Full-text + filter event search against the normalised event store.
 * Results are shown in a dense table with monospace timestamps and IPs.
 * IOC-hit events are highlighted in danger red.
 */

import type { JSX } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import Layout from '../components/layout/Layout';
import LoadingSkeleton from '../components/ui/LoadingSkeleton';
import { useEvents } from '../stores/events';

const thStyle: JSX.CSSProperties = {
  padding: '9px 14px',
  'font-size': '11px',
  'font-weight': '500',
  color: 'var(--text-muted)',
  'text-align': 'left',
  'border-bottom': '1px solid var(--border)',
  'white-space': 'nowrap',
  'text-transform': 'uppercase',
  'letter-spacing': '0.05em',
  background: 'var(--bg)',
};

const tdStyle: JSX.CSSProperties = {
  padding: '9px 14px',
  'font-size': '12px',
  'border-bottom': '1px solid var(--border-subtle)',
  'white-space': 'nowrap',
};

const SOURCE_TYPES = ['', 'windows', 'linux', 'network', 'cloud', 'ot'] as const;
const SEVERITIES = ['', 'critical', 'high', 'medium', 'low', 'info'] as const;

/**
 * Event search page with time-range, source-type, and severity filters.
 */
export default function EventsPage(): JSX.Element {
  const { state, searchEvents, loadNextPage } = useEvents();

  // Filter state — bound to form fields.
  const [query, setQuery] = createSignal('');
  const [sourceType, setSourceType] = createSignal('');
  const [severity, setSeverity] = createSignal('');
  const [iocOnly, setIocOnly] = createSignal(false);

  const defaultFrom = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
  const [fromTs, setFromTs] = createSignal(defaultFrom);

  const hasMore = () => state.events.length < state.total;

  const handleSearch = (e: Event): void => {
    e.preventDefault();
    void searchEvents({
      query: query().trim() || undefined,
      source_type: sourceType() || undefined,
      severity: severity() || undefined,
      ioc_hit: iocOnly() ? true : undefined,
      from: fromTs() ? new Date(fromTs()).toISOString() : undefined,
      limit: 100,
      offset: 0,
    });
  };

  const inputStyle: JSX.CSSProperties = {
    padding: '8px 10px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    'border-radius': 'var(--radius-md)',
    color: 'var(--text)',
    'font-size': '13px',
    outline: 'none',
  };

  const selectStyle: JSX.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  return (
    <Layout title="Event Search">
      {/* Search form */}
      <form
        onSubmit={handleSearch}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius-lg)',
          padding: '16px 20px',
          'margin-bottom': '20px',
          display: 'flex',
          'flex-wrap': 'wrap',
          gap: '10px',
          'align-items': 'flex-end',
        }}
      >
        {/* Free-text query */}
        <div style={{ flex: '1 1 280px', 'min-width': '200px' }}>
          <label
            for="event-query"
            style={{
              display: 'block',
              'font-size': '11px',
              color: 'var(--text-muted)',
              'margin-bottom': '4px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            Search
          </label>
          <input
            id="event-query"
            type="text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="hostname, IP address, username, process…"
            style={{ ...inputStyle, width: '100%' }}
            aria-label="Event free-text search"
          />
        </div>

        {/* From timestamp */}
        <div>
          <label
            for="event-from"
            style={{
              display: 'block',
              'font-size': '11px',
              color: 'var(--text-muted)',
              'margin-bottom': '4px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            From
          </label>
          <input
            id="event-from"
            type="datetime-local"
            value={fromTs()}
            onInput={(e) => setFromTs(e.currentTarget.value)}
            style={{ ...inputStyle, 'font-family': 'var(--font-mono)', 'font-size': '12px' }}
          />
        </div>

        {/* Source type filter */}
        <div>
          <label
            for="event-source"
            style={{
              display: 'block',
              'font-size': '11px',
              color: 'var(--text-muted)',
              'margin-bottom': '4px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            Source
          </label>
          <select
            id="event-source"
            value={sourceType()}
            onChange={(e) => setSourceType(e.currentTarget.value)}
            style={selectStyle}
          >
            <For each={SOURCE_TYPES}>
              {(s) => (
                <option value={s} style={{ background: 'var(--surface)' }}>
                  {s === '' ? 'All sources' : s}
                </option>
              )}
            </For>
          </select>
        </div>

        {/* Severity filter */}
        <div>
          <label
            for="event-severity"
            style={{
              display: 'block',
              'font-size': '11px',
              color: 'var(--text-muted)',
              'margin-bottom': '4px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.05em',
            }}
          >
            Severity
          </label>
          <select
            id="event-severity"
            value={severity()}
            onChange={(e) => setSeverity(e.currentTarget.value)}
            style={selectStyle}
          >
            <For each={SEVERITIES}>
              {(s) => (
                <option value={s} style={{ background: 'var(--surface)' }}>
                  {s === '' ? 'All severities' : s}
                </option>
              )}
            </For>
          </select>
        </div>

        {/* IOC-only toggle */}
        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
            'font-size': '13px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            'padding-bottom': '2px',
          }}
        >
          <input
            type="checkbox"
            checked={iocOnly()}
            onChange={(e) => setIocOnly(e.currentTarget.checked)}
            style={{ cursor: 'pointer' }}
          />
          IOC hits only
        </label>

        <button
          type="submit"
          disabled={state.isLoading}
          style={{
            padding: '8px 20px',
            background: state.isLoading ? 'var(--primary-dim)' : 'var(--primary)',
            border: 'none',
            'border-radius': 'var(--radius-md)',
            color: 'white',
            'font-size': '13px',
            'font-weight': '600',
            cursor: state.isLoading ? 'not-allowed' : 'pointer',
            transition: 'background var(--transition-fast)',
          }}
        >
          {state.isLoading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Results meta */}
      <Show when={state.total > 0 && !state.isLoading}>
        <p
          style={{
            'font-size': '12px',
            color: 'var(--text-muted)',
            'margin-bottom': '10px',
          }}
        >
          {state.total.toLocaleString()} events matched — showing {state.events.length} — query took{' '}
          {state.queryMs} ms
        </p>
      </Show>

      {/* Error */}
      <Show when={state.error !== null}>
        <div
          role="alert"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--danger)',
            'border-radius': 'var(--radius-md)',
            padding: '12px 16px',
            'font-size': '13px',
            color: '#fca5a5',
            'margin-bottom': '16px',
          }}
        >
          {state.error}
        </div>
      </Show>

      {/* Results table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ 'overflow-x': 'auto' }}>
          <table
            style={{ width: '100%', 'border-collapse': 'collapse' }}
            aria-label="Event search results"
          >
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Host</th>
                <th style={thStyle}>Src IP</th>
                <th style={thStyle}>Dst IP</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Process</th>
                <th style={thStyle}>Severity</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={!state.isLoading}
                fallback={
                  <For each={Array.from({ length: 12 })}>
                    {() => (
                      <tr>
                        <For each={Array.from({ length: 9 })}>
                          {() => (
                            <td style={{ padding: '10px 14px' }}>
                              <LoadingSkeleton height={12} />
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                }
              >
                <Show
                  when={state.events.length > 0}
                  fallback={
                    <tr>
                      <td
                        colspan={9}
                        style={{
                          ...tdStyle,
                          'text-align': 'center',
                          color: 'var(--text-muted)',
                          padding: '40px',
                        }}
                      >
                        {state.total === 0 && state.queryMs === 0
                          ? 'Run a search to see events.'
                          : 'No events matched your filters.'}
                      </td>
                    </tr>
                  }
                >
                  <For each={state.events}>
                    {(event) => {
                      const iocHit = event.ioc_hit;
                      const rowColor = iocHit ? 'rgba(239,68,68,0.06)' : 'transparent';
                      return (
                        <tr class="kron-event-row" style={{ background: rowColor }}>
                          <td
                            style={{
                              ...tdStyle,
                              'font-family': 'var(--font-mono)',
                              'font-size': '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {new Date(event.ts).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'medium',
                            })}
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--text)' }}>{event.event_type}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color: 'var(--text-muted)',
                              'text-transform': 'capitalize',
                            }}
                          >
                            {event.source_type}
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--text)' }}>{event.hostname}</td>
                          <td
                            style={{
                              ...tdStyle,
                              'font-family': 'var(--font-mono)',
                              'font-size': '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {event.src_ip ?? '—'}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              'font-family': 'var(--font-mono)',
                              'font-size': '11px',
                              color: iocHit ? 'var(--danger)' : 'var(--text-muted)',
                              'font-weight': iocHit ? '600' : 'normal',
                            }}
                          >
                            {event.dst_ip ?? '—'}
                            {iocHit && event.ioc_type && (
                              <span
                                style={{
                                  'margin-left': '6px',
                                  'font-size': '10px',
                                  background: 'rgba(239,68,68,0.2)',
                                  'border-radius': '3px',
                                  padding: '1px 4px',
                                }}
                              >
                                {event.ioc_type}
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                            {event.username ?? '—'}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              'font-family': 'var(--font-mono)',
                              'font-size': '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {event.process_name ?? '—'}
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                'font-size': '11px',
                                'font-weight': '500',
                                color:
                                  event.severity === 'critical'
                                    ? 'var(--danger)'
                                    : event.severity === 'high'
                                      ? 'var(--warning)'
                                      : event.severity === 'medium'
                                        ? 'var(--primary)'
                                        : 'var(--text-muted)',
                              }}
                            >
                              {event.severity}
                            </span>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </Show>
              </Show>
            </tbody>
          </table>
        </div>

        {/* Load more */}
        <Show when={hasMore() && !state.isLoading && state.events.length > 0}>
          <div style={{ padding: '12px', 'border-top': '1px solid var(--border)', 'text-align': 'center' }}>
            <button
              onClick={() => void loadNextPage()}
              style={{
                padding: '7px 20px',
                background: 'transparent',
                border: '1px solid var(--border)',
                'border-radius': 'var(--radius-md)',
                color: 'var(--text-muted)',
                'font-size': '12px',
                cursor: 'pointer',
              }}
            >
              Load more ({state.total - state.events.length} remaining)
            </button>
          </div>
        </Show>
      </div>

      <style>{`
        .kron-event-row:hover td {
          background: var(--surface2) !important;
          cursor: pointer;
        }
      `}</style>
    </Layout>
  );
}
