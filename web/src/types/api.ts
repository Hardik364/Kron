/**
 * KRON API type definitions.
 *
 * All types here correspond 1:1 with the backend API (docs/API.md).
 * Never define API shapes anywhere else in the codebase.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  totp?: string;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  tenant_id: string;
  role: string;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface KronEvent {
  event_id: string;
  tenant_id: string;
  ts: string;
  source_type: string;
  event_type: string;
  hostname: string;
  src_ip?: string;
  dst_ip?: string;
  dst_port?: number;
  severity: string;
  anomaly_score?: number;
  ioc_hit: boolean;
  ioc_type?: string;
  mitre_tactic?: string;
  mitre_technique?: string;
  process_name?: string;
  process_pid?: number;
  username?: string;
  country_code?: string;
  raw?: string;
}

export interface EventListResponse {
  total: number;
  events: KronEvent[];
  query_ms: number;
}

export interface EventQuery {
  tenant_id?: string;
  from?: string;
  to?: string;
  source_type?: string;
  severity?: string;
  ioc_hit?: boolean;
  hostname?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/** Alert status values as returned by the API. */
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';

/** Alert severity levels. Maps to P1–P5. */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface KronAlert {
  alert_id: string;
  rule_name: string;
  severity: string;
  risk_score: number;
  created_at: string;
  updated_at?: string;
  affected_assets: string[];
  affected_users: string[];
  mitre_tactic?: string;
  mitre_technique?: string;
  mitre_sub_technique?: string;
  narrative_en: string;
  narrative_hi?: string;
  status: AlertStatus;
  assigned_to?: string;
  resolution_notes?: string;
  whatsapp_sent: boolean;
  sms_sent?: boolean;
  email_sent?: boolean;
  evidence_count?: number;
}

export interface AlertListResponse {
  total: number;
  alerts: KronAlert[];
  query_ms: number;
}

export interface AlertUpdateRequest {
  status?: AlertStatus;
  resolution_notes?: string;
  assigned_to?: string;
}

export interface AlertQuery {
  status?: AlertStatus;
  severity?: string;
  from?: string;
  to?: string;
  assigned_to?: string;
  mitre_tactic?: string;
  limit?: number;
  offset?: number;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  message?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime_secs: number;
  services: ServiceHealth[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  trace_id?: string;
}

/** Type guard: checks if an unknown value is an ApiError. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    'code' in value &&
    typeof (value as Record<string, unknown>)['error'] === 'string' &&
    typeof (value as Record<string, unknown>)['code'] === 'string'
  );
}
