/**
 * MetricCard
 *
 * Dashboard KPI card. Shows a metric title, large value, and optional
 * trend indicator (positive trend = green, negative = red, neutral = muted).
 */

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

interface MetricCardProps {
  title: string;
  value: string | number;
  /** Percentage change, e.g. 12.5 means +12.5%. Negative for decline. */
  trend?: number;
  /** Human-readable label for the trend, e.g. "vs last 24h". */
  trendLabel?: string;
  /** Accent colour for the top border stripe. Defaults to --primary. */
  color?: string;
  /** Optional subtitle below the value. */
  subtitle?: string;
}

/** Formats a trend number with sign and one decimal place. */
function formatTrend(trend: number): string {
  const sign = trend > 0 ? '+' : '';
  return `${sign}${trend.toFixed(1)}%`;
}

/**
 * Dashboard metric card with a coloured accent stripe.
 *
 * @example
 * <MetricCard
 *   title="Open P1 Alerts"
 *   value={12}
 *   trend={-25}
 *   trendLabel="vs last 24h"
 *   color="var(--critical)"
 * />
 */
export default function MetricCard(props: MetricCardProps): JSX.Element {
  const trendColor = () => {
    if (props.trend === undefined) return 'var(--text-muted)';
    if (props.trend > 0) return 'var(--danger)';
    if (props.trend < 0) return 'var(--success)';
    return 'var(--text-muted)';
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        'border-top': `3px solid ${props.color ?? 'var(--primary)'}`,
        'border-radius': 'var(--radius-lg)',
        padding: '20px 24px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '8px',
        'min-width': '160px',
        flex: '1',
      }}
    >
      <p
        style={{
          'font-size': '12px',
          'font-weight': '500',
          color: 'var(--text-muted)',
          'text-transform': 'uppercase',
          'letter-spacing': '0.06em',
        }}
      >
        {props.title}
      </p>

      <p
        style={{
          'font-size': '32px',
          'font-weight': '700',
          color: 'var(--text)',
          'line-height': '1',
          'font-variant-numeric': 'tabular-nums',
        }}
      >
        {props.value}
      </p>

      <Show when={props.subtitle}>
        <p style={{ 'font-size': '12px', color: 'var(--text-muted)' }}>{props.subtitle}</p>
      </Show>

      <Show when={props.trend !== undefined}>
        <p style={{ 'font-size': '12px', color: trendColor(), display: 'flex', gap: '4px', 'align-items': 'center' }}>
          <span style={{ 'font-weight': '600' }}>{formatTrend(props.trend!)}</span>
          <Show when={props.trendLabel}>
            <span style={{ color: 'var(--text-muted)' }}>{props.trendLabel}</span>
          </Show>
        </p>
      </Show>
    </div>
  );
}
