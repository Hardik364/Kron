-- Migration 001: Create events table (ClickHouse)
-- Primary fact table. Append-only. All log lines, endpoint events, network flows.
-- IPs stored as String for driver compatibility; cast at query time if needed.

CREATE TABLE IF NOT EXISTS events
(
    -- Identity
    event_id          String                          NOT NULL,
    tenant_id         LowCardinality(String)          NOT NULL,
    dedup_hash        UInt64                          DEFAULT 0,

    -- Timing (nanoseconds since Unix epoch stored as Int64)
    ts                DateTime64(9, 'UTC')            NOT NULL,
    ts_received       DateTime64(9, 'UTC')            NOT NULL,
    ingest_lag_ms     UInt32                          DEFAULT 0,

    -- Source
    source_type       LowCardinality(String)          NOT NULL,
    collector_id      String                          DEFAULT 'unknown',
    raw               String                          DEFAULT '',

    -- Asset context
    host_id           Nullable(String),
    hostname          Nullable(String),
    host_ip           Nullable(String),
    host_fqdn         Nullable(String),
    asset_criticality LowCardinality(String)          DEFAULT 'unknown',
    asset_tags        String                          DEFAULT '[]',

    -- User context
    user_name         Nullable(String),
    user_id           Nullable(String),
    user_domain       Nullable(String),
    user_type         Nullable(String),

    -- Event classification
    event_type        LowCardinality(String)          NOT NULL,
    event_category    Nullable(String),
    event_action      Nullable(String),

    -- Network fields
    src_ip            Nullable(String),
    src_ip6           Nullable(String),
    src_port          Nullable(UInt16),
    dst_ip            Nullable(String),
    dst_ip6           Nullable(String),
    dst_port          Nullable(UInt16),
    protocol          Nullable(String),
    bytes_in          Nullable(UInt64),
    bytes_out         Nullable(UInt64),
    packets_in        Nullable(UInt32),
    packets_out       Nullable(UInt32),
    direction         Nullable(String),

    -- Process fields
    process_name      Nullable(String),
    process_pid       Nullable(UInt32),
    process_ppid      Nullable(UInt32),
    process_path      Nullable(String),
    process_cmdline   Nullable(String),
    process_hash      Nullable(String),
    parent_process    Nullable(String),

    -- File fields
    file_path         Nullable(String),
    file_name         Nullable(String),
    file_hash         Nullable(String),
    file_size         Nullable(UInt64),
    file_action       Nullable(String),

    -- Authentication fields
    auth_result       Nullable(String),
    auth_method       Nullable(String),
    auth_protocol     Nullable(String),

    -- Geo enrichment
    src_country       Nullable(String),
    src_city          Nullable(String),
    src_asn           Nullable(UInt32),
    src_asn_name      Nullable(String),
    dst_country       Nullable(String),

    -- Threat intel
    ioc_hit           Bool                            DEFAULT false,
    ioc_type          Nullable(String),
    ioc_value         Nullable(String),
    ioc_feed          Nullable(String),

    -- MITRE ATT&CK
    mitre_tactic      Nullable(String),
    mitre_technique   Nullable(String),
    mitre_sub_tech    Nullable(String),

    -- Severity
    severity          LowCardinality(String)          DEFAULT 'info',
    severity_score    UInt8                           DEFAULT 0,

    -- AI scores
    anomaly_score     Float32                         DEFAULT 0.0,
    ueba_score        Float32                         DEFAULT 0.0,
    beacon_score      Float32                         DEFAULT 0.0,
    exfil_score       Float32                         DEFAULT 0.0,

    -- Flexible key-value fields (JSON string)
    fields            String                          DEFAULT '{}',

    schema_version    UInt8                           DEFAULT 1
)
ENGINE = ReplacingMergeTree(ts_received)
PARTITION BY (tenant_id, toYYYYMM(ts))
ORDER BY (tenant_id, ts, source_type, event_type)
TTL toDateTime(ts) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
