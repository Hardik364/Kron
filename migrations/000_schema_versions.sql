-- Migration 000: Schema version tracking table
-- This table tracks which migrations have been applied.

CREATE TABLE IF NOT EXISTS schema_versions (
    version     INTEGER NOT NULL,
    name        VARCHAR NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR NOT NULL,
    PRIMARY KEY (version)
);
