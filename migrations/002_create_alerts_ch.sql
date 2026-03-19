-- Migration 002: Create alerts table (ClickHouse)
-- Fired detections. One row per unique alert (deduped within 15-minute windows).

CREATE TABLE IF NOT EXISTS alerts
(
    -- Identity
    alert_id            String                      NOT NULL,
    tenant_id           LowCardinality(String)      NOT NULL,

    -- Detection
    rule_id             String                      NOT NULL,
    rule_name           String                      NOT NULL,
    rule_version        Nullable(String),
    detection_source    Nullable(String),

    -- Timing (milliseconds since Unix epoch)
    created_at          DateTime64(3, 'UTC')        NOT NULL,
    first_seen          DateTime64(3, 'UTC')        NOT NULL,
    last_seen           DateTime64(3, 'UTC')        NOT NULL,
    event_count         UInt32                      DEFAULT 1,

    -- Risk
    risk_score          UInt8                       NOT NULL,
    severity            LowCardinality(String)      NOT NULL,
    confidence          Nullable(Float32),

    -- MITRE ATT&CK
    mitre_tactic        Nullable(String),
    mitre_technique     Nullable(String),
    mitre_sub_tech      Nullable(String),
    kill_chain_stage    Nullable(String),

    -- Affected entities (JSON arrays)
    affected_assets     String                      DEFAULT '[]',
    affected_users      String                      DEFAULT '[]',
    affected_ips        String                      DEFAULT '[]',

    -- Evidence
    evidence_event_ids  String                      DEFAULT '[]',
    raw_matches         Nullable(String),

    -- AI enrichment
    narrative_en        Nullable(String),
    narrative_hi        Nullable(String),
    narrative_ta        Nullable(String),
    narrative_te        Nullable(String),
    root_cause_chain    Nullable(String),
    fp_probability      Nullable(Float32),
    suggested_playbook  Nullable(String),

    -- Lifecycle
    status              LowCardinality(String)      DEFAULT 'open',
    assigned_to         Nullable(String),
    resolved_at         Nullable(DateTime64(3, 'UTC')),
    resolved_by         Nullable(String),
    resolution_notes    Nullable(String),
    case_id             Nullable(String),

    -- Compliance
    cert_in_category    Nullable(String),
    rbi_control         Nullable(String),
    dpdp_applicable     Bool                        DEFAULT false,

    -- Notifications
    whatsapp_sent       Bool                        DEFAULT false,
    sms_sent            Bool                        DEFAULT false,
    email_sent          Bool                        DEFAULT false,
    notification_ts     Nullable(DateTime64(3, 'UTC')),

    schema_version      UInt8                       DEFAULT 1
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(created_at))
ORDER BY (tenant_id, created_at, severity, risk_score)
TTL toDateTime(created_at) + INTERVAL 365 DAY;
