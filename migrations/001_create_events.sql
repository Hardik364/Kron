-- Migration 001: Create events table
-- Works with DuckDB. ClickHouse DDL is in 001_create_events_ch.sql

CREATE TABLE IF NOT EXISTS events (
    -- Identity
    event_id        VARCHAR NOT NULL,
    tenant_id       VARCHAR NOT NULL,
    dedup_hash      UBIGINT NOT NULL DEFAULT 0,

    -- Timing
    ts              TIMESTAMPTZ NOT NULL,
    ts_received     TIMESTAMPTZ NOT NULL,
    ingest_lag_ms   UINTEGER DEFAULT 0,

    -- Source
    source_type     VARCHAR NOT NULL,
    collector_id    VARCHAR NOT NULL DEFAULT 'unknown',
    raw             VARCHAR NOT NULL DEFAULT '',

    -- Asset context
    host_id         VARCHAR,
    hostname        VARCHAR,
    host_ip         VARCHAR,
    host_fqdn       VARCHAR,
    asset_criticality VARCHAR DEFAULT 'unknown',
    asset_tags      VARCHAR DEFAULT '[]',

    -- User context
    user_name       VARCHAR,
    user_id         VARCHAR,
    user_domain     VARCHAR,
    user_type       VARCHAR,

    -- Event classification
    event_type      VARCHAR NOT NULL,
    event_category  VARCHAR,
    event_action    VARCHAR,

    -- Network fields
    src_ip          VARCHAR,
    src_ip6         VARCHAR,
    src_port        USMALLINT,
    dst_ip          VARCHAR,
    dst_ip6         VARCHAR,
    dst_port        USMALLINT,
    protocol        VARCHAR,
    bytes_in        UBIGINT,
    bytes_out       UBIGINT,
    packets_in      UINTEGER,
    packets_out     UINTEGER,
    direction       VARCHAR,

    -- Process fields
    process_name    VARCHAR,
    process_pid     UINTEGER,
    process_ppid    UINTEGER,
    process_path    VARCHAR,
    process_cmdline VARCHAR,
    process_hash    VARCHAR,
    parent_process  VARCHAR,

    -- File fields
    file_path       VARCHAR,
    file_name       VARCHAR,
    file_hash       VARCHAR,
    file_size       UBIGINT,
    file_action     VARCHAR,

    -- Authentication fields
    auth_result     VARCHAR,
    auth_method     VARCHAR,
    auth_protocol   VARCHAR,

    -- Geo enrichment
    src_country     VARCHAR,
    src_city        VARCHAR,
    src_asn         UINTEGER,
    src_asn_name    VARCHAR,
    dst_country     VARCHAR,

    -- Threat intel
    ioc_hit         BOOLEAN DEFAULT false,
    ioc_type        VARCHAR,
    ioc_value       VARCHAR,
    ioc_feed        VARCHAR,

    -- MITRE
    mitre_tactic    VARCHAR,
    mitre_technique VARCHAR,
    mitre_sub_tech  VARCHAR,

    -- Severity
    severity        VARCHAR DEFAULT 'info',
    severity_score  UTINYINT DEFAULT 0,

    -- AI scores
    anomaly_score   FLOAT DEFAULT 0.0,
    ueba_score      FLOAT DEFAULT 0.0,
    beacon_score    FLOAT DEFAULT 0.0,
    exfil_score     FLOAT DEFAULT 0.0,

    -- Flexible fields (stored as JSON string)
    fields          VARCHAR DEFAULT '{}',

    -- Audit
    schema_version  UTINYINT DEFAULT 1,

    PRIMARY KEY (event_id)
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_ts ON events(tenant_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_tenant_host ON events(tenant_id, hostname);
CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_tenant_source ON events(tenant_id, source_type);
