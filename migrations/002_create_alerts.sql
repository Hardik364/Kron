-- Migration 002: Create alerts table
-- Works with DuckDB. ClickHouse DDL is in 002_create_alerts_ch.sql

CREATE TABLE IF NOT EXISTS alerts (
    -- Identity
    alert_id            VARCHAR NOT NULL,
    tenant_id           VARCHAR NOT NULL,

    -- Detection
    rule_id             VARCHAR NOT NULL,
    rule_name           VARCHAR NOT NULL,
    rule_version        VARCHAR,
    detection_source    VARCHAR,

    -- Timing
    created_at          TIMESTAMPTZ NOT NULL,
    first_seen          TIMESTAMPTZ NOT NULL,
    last_seen           TIMESTAMPTZ NOT NULL,
    event_count         UINTEGER DEFAULT 1,

    -- Risk
    risk_score          UTINYINT NOT NULL,
    severity            VARCHAR NOT NULL,
    confidence          FLOAT,

    -- MITRE
    mitre_tactic        VARCHAR,
    mitre_technique     VARCHAR,
    mitre_sub_tech      VARCHAR,
    kill_chain_stage    VARCHAR,

    -- Affected entities (stored as JSON arrays)
    affected_assets     VARCHAR DEFAULT '[]',
    affected_users      VARCHAR DEFAULT '[]',
    affected_ips        VARCHAR DEFAULT '[]',

    -- Evidence
    evidence_event_ids  VARCHAR DEFAULT '[]',
    raw_matches         VARCHAR,

    -- AI enrichment
    narrative_en        VARCHAR,
    narrative_hi        VARCHAR,
    narrative_ta        VARCHAR,
    narrative_te        VARCHAR,
    root_cause_chain    VARCHAR,
    fp_probability      FLOAT,
    suggested_playbook  VARCHAR,

    -- Lifecycle
    status              VARCHAR DEFAULT 'open',
    assigned_to         VARCHAR,
    resolved_at         TIMESTAMPTZ,
    resolved_by         VARCHAR,
    resolution_notes    VARCHAR,
    case_id             VARCHAR,

    -- Compliance
    cert_in_category    VARCHAR,
    rbi_control         VARCHAR,
    dpdp_applicable     BOOLEAN DEFAULT false,

    -- Notifications
    whatsapp_sent       BOOLEAN DEFAULT false,
    sms_sent            BOOLEAN DEFAULT false,
    email_sent          BOOLEAN DEFAULT false,
    notification_ts     TIMESTAMPTZ,

    schema_version      UTINYINT DEFAULT 1,

    PRIMARY KEY (alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_created ON alerts(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_severity ON alerts(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts(tenant_id, status);
