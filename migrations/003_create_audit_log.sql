-- Migration 003: Create audit_log table
-- Works with DuckDB. ClickHouse DDL is in 003_create_audit_log_ch.sql
-- Merkle-chained for tamper evidence (ADR-015).

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id        VARCHAR NOT NULL,
    tenant_id       VARCHAR NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,

    -- Actor
    actor_id        VARCHAR NOT NULL,
    actor_type      VARCHAR NOT NULL,
    actor_ip        VARCHAR,
    session_id      VARCHAR,

    -- Action
    action          VARCHAR NOT NULL,
    resource_type   VARCHAR,
    resource_id     VARCHAR,
    result          VARCHAR NOT NULL,

    -- Detail
    request_body    VARCHAR,
    response_code   USMALLINT,
    duration_ms     UINTEGER,

    -- Merkle chain
    prev_hash       VARCHAR NOT NULL,
    row_hash        VARCHAR NOT NULL,
    chain_seq       UBIGINT NOT NULL,

    PRIMARY KEY (audit_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_log(tenant_id, chain_seq);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_log(tenant_id, ts);
