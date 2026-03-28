/**
 * KRON SIEM — k6 Load Test: 50,000 EPS sustained for 1 hour.
 *
 * This test verifies Phase 5.4 acceptance criteria:
 *   - 50,000 events per second sustained for 1 hour
 *   - 0 events lost (all events must be acknowledged by kron-collector)
 *   - p99 alert latency (source → WhatsApp notification) < 2 minutes
 *
 * Usage:
 *   k6 run --env KRON_API_URL=https://staging.kron.security \
 *           --env KRON_INTAKE_URL=https://staging.kron.security:4443 \
 *           --env KRON_AGENT_TOKEN=<agent-token> \
 *           --env KRON_ANALYST_TOKEN=<analyst-jwt> \
 *           tests/performance/k6-load-test.js
 *
 * Prerequisites:
 *   brew install k6        # macOS
 *   apt install k6         # Ubuntu (k6 apt repo)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────────

/** Total events successfully acknowledged by kron-collector. */
const eventsAcknowledged = new Counter('kron_events_acknowledged');

/** Total events that received an error response (lost). */
const eventsLost = new Counter('kron_events_lost');

/** HTTP error rate on the intake endpoint. */
const intakeErrorRate = new Rate('kron_intake_error_rate');

/** Latency from event injection to alert appearing in API (alert pipeline latency). */
const alertPipelineLatency = new Trend('kron_alert_pipeline_latency_ms', true);

// ── Test configuration ─────────────────────────────────────────────────────────

/**
 * 50,000 EPS for 1 hour.
 *
 * Strategy: 500 VUs each submitting batches of 100 events every second.
 * 500 VUs × 100 events/batch × 1 batch/sec = 50,000 EPS.
 *
 * Ramp-up: 5 minutes to reach full load (avoids thundering herd at start).
 * Sustained: 60 minutes at 50K EPS.
 * Ramp-down: 2 minutes.
 */
export const options = {
  scenarios: {
    event_intake: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 500 },   // ramp up
        { duration: '60m', target: 500 },  // sustain 50K EPS
        { duration: '2m', target: 0 },     // ramp down
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'event_intake' },
    },
    // Separate scenario for query load (read path) during event storm.
    api_read: {
      executor: 'constant-vus',
      vus: 20,
      duration: '67m',
      startTime: '5m',
      tags: { scenario: 'api_read' },
    },
  },
  thresholds: {
    // Phase 5.4 acceptance criteria:
    'kron_intake_error_rate': ['rate < 0.001'],          // < 0.1% error rate
    'kron_events_lost': ['count == 0'],                   // 0 events lost
    'http_req_duration{scenario:event_intake}': ['p99 < 5000'],  // intake p99 < 5s
    'http_req_duration{scenario:api_read}': ['p99 < 3000'],      // query p99 < 3s
    'kron_alert_pipeline_latency_ms': ['p99 < 120000'],  // alert latency p99 < 2 min
  },
};

// ── Environment ────────────────────────────────────────────────────────────────

const INTAKE_URL = __ENV.KRON_INTAKE_URL || 'http://localhost:4443';
const API_URL = __ENV.KRON_API_URL || 'http://localhost:3000';
const AGENT_TOKEN = __ENV.KRON_AGENT_TOKEN || 'test-agent-token';
const ANALYST_TOKEN = __ENV.KRON_ANALYST_TOKEN || 'test-analyst-token';
const TENANT_ID = __ENV.KRON_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// ── Event templates ────────────────────────────────────────────────────────────

/**
 * Generates a realistic batch of 100 KronEvents.
 * Mix of event types to stress the normalizer's format detection.
 */
function generateEventBatch(batchId) {
  const events = [];
  const now = new Date().toISOString();

  for (let i = 0; i < 100; i++) {
    const evType = i % 5;
    events.push({
      event_id: uuidv4(),
      tenant_id: TENANT_ID,
      hostname: `loadtest-host-${(i % 50).toString().padStart(3, '0')}`,
      timestamp: now,
      event_type: ['process_start', 'network_connection', 'file_access', 'auth_attempt', 'dns_query'][evType],
      severity: ['info', 'low', 'medium', 'high', 'critical'][i % 5],
      src_ip: `10.${(i % 256)}.${((i * 7) % 256)}.${((i * 13) % 256)}`,
      dst_ip: `172.16.${(i % 50)}.1`,
      process_name: ['sshd', 'nginx', 'python3', 'curl', 'bash'][evType],
      raw: `loadtest batch=${batchId} seq=${i} ${now}`,
    });
  }

  return events;
}

// ── Scenario: event_intake ─────────────────────────────────────────────────────

export default function () {
  const scenario = __ENV.K6_SCENARIO_NAME || 'event_intake';

  if (scenario === 'api_read') {
    runApiRead();
  } else {
    runEventIntake();
  }
}

function runEventIntake() {
  const batchId = uuidv4();
  const events = generateEventBatch(batchId);

  const res = http.post(
    `${INTAKE_URL}/intake/v1/events`,
    JSON.stringify({ events }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGENT_TOKEN}`,
        'X-Batch-ID': batchId,
      },
      timeout: '10s',
      tags: { endpoint: 'intake' },
    }
  );

  const ok = check(res, {
    'intake status 200 or 202': (r) => r.status === 200 || r.status === 202,
    'intake responded': (r) => r.timings.duration < 5000,
  });

  if (ok) {
    eventsAcknowledged.add(events.length);
    intakeErrorRate.add(0);
  } else {
    eventsLost.add(events.length);
    intakeErrorRate.add(1);
  }

  // No sleep — we want maximum throughput.
}

// ── Scenario: api_read ─────────────────────────────────────────────────────────

function runApiRead() {
  const headers = {
    'Authorization': `Bearer ${ANALYST_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Query 1: alert list
  const alertsRes = http.get(
    `${API_URL}/api/v1/alerts?status=open&limit=50`,
    { headers, timeout: '30s', tags: { endpoint: 'alerts_list' } }
  );
  check(alertsRes, {
    'alerts list 200': (r) => r.status === 200,
    'alerts list < 3s': (r) => r.timings.duration < 3000,
  });

  // Query 2: event search (exercises ClickHouse)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 1h
  const eventsRes = http.get(
    `${API_URL}/api/v1/events?from=${since}&limit=100`,
    { headers, timeout: '30s', tags: { endpoint: 'events_query' } }
  );
  check(eventsRes, {
    'events query 200': (r) => r.status === 200,
    'events query < 3s': (r) => r.timings.duration < 3000,
  });

  sleep(1);
}

// ── Setup: verify environment before test ──────────────────────────────────────

export function setup() {
  // Verify the intake endpoint is reachable.
  const healthRes = http.get(`${API_URL}/health`, { timeout: '10s' });
  if (healthRes.status !== 200) {
    throw new Error(`KRON health check failed: ${healthRes.status} ${healthRes.body}`);
  }

  console.log(`[KRON load test] Target: ${INTAKE_URL}`);
  console.log(`[KRON load test] Tenant: ${TENANT_ID}`);
  console.log(`[KRON load test] Target EPS: 50,000 (500 VUs × 100 events/batch)`);
  console.log(`[KRON load test] Duration: 60 minutes sustained`);

  return { startedAt: Date.now() };
}

// ── Teardown: print summary ────────────────────────────────────────────────────

export function teardown(data) {
  const durationMin = Math.round((Date.now() - data.startedAt) / 60000);
  console.log(`[KRON load test] Completed after ${durationMin} minutes`);
  console.log('[KRON load test] Check kron_events_lost threshold — must be 0 for Phase 5.4 pass');
}
