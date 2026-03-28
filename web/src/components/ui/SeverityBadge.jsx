/**
 * SeverityBadge
 *
 * Renders a coloured pill for P1–P5 / critical–info severity values.
 * Accepts both the numeric form ("p1", "p2"…) and the named form
 * ("critical", "high", "medium", "low", "info").
 *
 * Uses CSS custom properties from the global design system.
 */
const SEVERITY_MAP = {
    p1: { label: 'P1 · Critical', bg: 'var(--sev-p1-bg)', text: 'var(--sev-p1-text)', border: 'var(--sev-p1-border)' },
    critical: { label: 'P1 · Critical', bg: 'var(--sev-p1-bg)', text: 'var(--sev-p1-text)', border: 'var(--sev-p1-border)' },
    p2: { label: 'P2 · High', bg: 'var(--sev-p2-bg)', text: 'var(--sev-p2-text)', border: 'var(--sev-p2-border)' },
    high: { label: 'P2 · High', bg: 'var(--sev-p2-bg)', text: 'var(--sev-p2-text)', border: 'var(--sev-p2-border)' },
    p3: { label: 'P3 · Medium', bg: 'var(--sev-p3-bg)', text: 'var(--sev-p3-text)', border: 'var(--sev-p3-border)' },
    medium: { label: 'P3 · Medium', bg: 'var(--sev-p3-bg)', text: 'var(--sev-p3-text)', border: 'var(--sev-p3-border)' },
    p4: { label: 'P4 · Low', bg: 'var(--sev-p4-bg)', text: 'var(--sev-p4-text)', border: 'var(--sev-p4-border)' },
    low: { label: 'P4 · Low', bg: 'var(--sev-p4-bg)', text: 'var(--sev-p4-text)', border: 'var(--sev-p4-border)' },
    p5: { label: 'P5 · Info', bg: 'var(--sev-p5-bg)', text: 'var(--sev-p5-text)', border: 'var(--sev-p5-border)' },
    info: { label: 'P5 · Info', bg: 'var(--sev-p5-bg)', text: 'var(--sev-p5-text)', border: 'var(--sev-p5-border)' },
};
/** Resolve severity style, falling back to Info styling for unknown values. */
function resolveSeverity(raw) {
    const key = raw.trim().toLowerCase();
    return SEVERITY_MAP[key] ?? SEVERITY_MAP['info'];
}
/**
 * Coloured severity badge pill.
 *
 * @example
 * <SeverityBadge severity="critical" />
 * <SeverityBadge severity="p2" large />
 */
export default function SeverityBadge(props) {
    const style = () => resolveSeverity(props.severity);
    const baseStyles = {
        display: 'inline-flex',
        'align-items': 'center',
        'border-radius': 'var(--radius-sm)',
        'border-width': '1px',
        'border-style': 'solid',
        'font-weight': '500',
        'white-space': 'nowrap',
        'line-height': '1',
    };
    return (<span style={{
            ...baseStyles,
            background: style().bg,
            color: style().text,
            'border-color': style().border,
            padding: props.large ? '5px 10px' : '2px 7px',
            'font-size': props.large ? '12px' : '11px',
        }} aria-label={`Severity: ${style().label}`}>
      {style().label}
    </span>);
}
