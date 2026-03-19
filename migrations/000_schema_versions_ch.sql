-- Migration 000: Schema version tracking table (ClickHouse)
-- Tracks which migrations have been applied.
-- Uses ReplacingMergeTree so duplicate inserts are de-duplicated on version.

CREATE TABLE IF NOT EXISTS schema_versions
(
    version    Int32   NOT NULL,
    name       String  NOT NULL,
    applied_at DateTime DEFAULT now(),
    checksum   String  NOT NULL
)
ENGINE = ReplacingMergeTree()
ORDER BY version;
