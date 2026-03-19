-- Migration 003: Create audit_log table (ClickHouse)
-- Tamper-evident audit trail. Every user action, every API call.
-- Merkle-chained per tenant (ADR-015). No TTL — retained indefinitely.

CREATE TABLE IF NOT EXISTS audit_log
(
    audit_id        String                      NOT NULL,
    tenant_id       LowCardinality(String)      NOT NULL,
    ts              DateTime64(9, 'UTC')        NOT NULL,

    -- Actor
    actor_id        String                      NOT NULL,
    actor_type      LowCardinality(String)      NOT NULL,
    actor_ip        Nullable(String),
    session_id      Nullable(String),

    -- Action
    action          LowCardinality(String)      NOT NULL,
    resource_type   Nullable(String),
    resource_id     Nullable(String),
    result          LowCardinality(String)      NOT NULL,

    -- Detail
    request_body    Nullable(String),
    response_code   Nullable(UInt16),
    duration_ms     Nullable(UInt32),

    -- Merkle chain
    prev_hash       FixedString(64)             NOT NULL,
    row_hash        FixedString(64)             NOT NULL,
    chain_seq       UInt64                      NOT NULL
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(ts))
ORDER BY (tenant_id, chain_seq)
SETTINGS parts_to_throw_insert = 0;
