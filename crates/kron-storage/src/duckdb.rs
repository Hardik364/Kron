//! DuckDB implementation of [`StorageEngine`].
//!
//! DuckDB is used for Nano tier deployments. It's embedded (single binary),
//! uses Parquet natively, and supports all SQL operations synchronously.
//!
//! Connection pooling: single connection with Arc<Mutex<>> for thread safety.
//! Retry logic: exponential backoff on transient errors (locked database, etc.).

use crate::query::EventFilter;
use crate::traits::{AuditLogEntry, LatencyStats, StorageEngine, StorageResult};
use async_trait::async_trait;
use kron_types::{KronAlert, KronError, KronEvent, TenantContext};
use tracing::instrument;

/// DuckDB storage engine.
///
/// Holds a single connection to a local DuckDB database file.
/// All operations are serialized through a Mutex (DuckDB doesn't support
/// concurrent writes anyway).
pub struct DuckDbEngine {
    /// Database file path.
    db_path: String,
}

impl DuckDbEngine {
    /// Create a new DuckDB storage engine connected to the given path.
    ///
    /// # Arguments
    /// * `db_path` - Path to the DuckDB database file (will be created if missing)
    ///
    /// # Returns
    /// New engine, or error if the database cannot be opened.
    ///
    /// # Tenant Isolation
    /// DuckDB will enforce `tenant_id` on every query through the [`QueryBuilder`].
    pub async fn new(db_path: &str) -> StorageResult<Self> {
        tracing::debug!(db_path = %db_path, "Initializing DuckDB storage engine");

        // TODO(#TBD, hardik, v1.1): Actual DuckDB connection initialization
        // For now, this is a stub that will be filled in when duckdb crate is added.

        Ok(Self {
            db_path: db_path.to_string(),
        })
    }

    /// Apply all pending migrations from the `migrations/` directory.
    ///
    /// Migrations are numbered (001_, 002_, etc.) and executed in order.
    /// Migration state is tracked in a `schema_versions` table.
    pub async fn apply_migrations(&self) -> StorageResult<()> {
        tracing::debug!("Applying DuckDB migrations");

        // TODO(#TBD, hardik, v1.1): Read migration files from migrations/ directory
        // and execute them idempotently.

        Ok(())
    }
}

#[async_trait]
impl StorageEngine for DuckDbEngine {
    #[instrument(skip(self, ctx, events), fields(
        tenant_id = %ctx.tenant_id(),
        event_count = events.len()
    ))]
    async fn insert_events(
        &self,
        ctx: &TenantContext,
        events: Vec<KronEvent>,
    ) -> StorageResult<u64> {
        let tenant_id = ctx.tenant_id();
        let event_count = events.len() as u64;

        // Verify all events belong to this tenant
        for event in &events {
            if event.tenant_id != tenant_id {
                return Err(KronError::TenantIsolationViolation {
                    caller: tenant_id.to_string(),
                    target: event.tenant_id.to_string(),
                });
            }
        }

        // TODO(#TBD, hardik, v1.1): Execute INSERT statement
        // Use QueryBuilder::insert_events() to construct parameterized query.
        // Return number of successfully inserted rows.

        Ok(event_count)
    }

    #[instrument(skip(self, ctx), fields(tenant_id = %ctx.tenant_id()))]
    async fn query_events(
        &self,
        ctx: &TenantContext,
        _filter: Option<EventFilter>,
        _limit: u32,
    ) -> StorageResult<Vec<KronEvent>> {
        // TODO(#TBD, hardik, v1.1): Execute SELECT query with QueryBuilder
        // Always enforces tenant_id through QueryBuilder::select_events()
        Ok(Vec::new())
    }

    #[instrument(skip(self, ctx), fields(tenant_id = %ctx.tenant_id(), event_id = %event_id))]
    async fn get_event(
        &self,
        ctx: &TenantContext,
        event_id: &str,
    ) -> StorageResult<Option<KronEvent>> {
        // TODO(#TBD, hardik, v1.1): Execute SELECT by ID with tenant isolation
        Ok(None)
    }

    #[instrument(skip(self, ctx, alerts), fields(
        tenant_id = %ctx.tenant_id(),
        alert_count = alerts.len()
    ))]
    async fn insert_alerts(
        &self,
        ctx: &TenantContext,
        alerts: Vec<KronAlert>,
    ) -> StorageResult<u64> {
        let tenant_id = ctx.tenant_id();
        let alert_count = alerts.len() as u64;

        // Verify all alerts belong to this tenant
        for alert in &alerts {
            if alert.tenant_id != tenant_id {
                return Err(KronError::TenantIsolationViolation {
                    caller: tenant_id.to_string(),
                    target: alert.tenant_id.to_string(),
                });
            }
        }

        // TODO(#TBD, hardik, v1.1): Execute INSERT into alerts table
        Ok(alert_count)
    }

    #[instrument(skip(self, ctx), fields(tenant_id = %ctx.tenant_id()))]
    async fn query_alerts(
        &self,
        ctx: &TenantContext,
        _limit: u32,
        _offset: u32,
    ) -> StorageResult<Vec<KronAlert>> {
        // TODO(#TBD, hardik, v1.1): Execute SELECT from alerts table
        Ok(Vec::new())
    }

    #[instrument(skip(self, ctx), fields(tenant_id = %ctx.tenant_id(), alert_id = %alert_id))]
    async fn get_alert(
        &self,
        ctx: &TenantContext,
        alert_id: &str,
    ) -> StorageResult<Option<KronAlert>> {
        // TODO(#TBD, hardik, v1.1): Execute SELECT by ID with tenant isolation
        Ok(None)
    }

    #[instrument(skip(self, ctx, alert), fields(tenant_id = %ctx.tenant_id()))]
    async fn update_alert(
        &self,
        ctx: &TenantContext,
        alert: &KronAlert,
    ) -> StorageResult<()> {
        let tenant_id = ctx.tenant_id();

        if alert.tenant_id != tenant_id {
            return Err(KronError::TenantIsolationViolation {
                caller: tenant_id.to_string(),
                target: alert.tenant_id.to_string(),
            });
        }

        // TODO(#TBD, hardik, v1.1): Execute UPDATE query
        Ok(())
    }

    #[instrument(skip(self, ctx, _entry), fields(
        tenant_id = %ctx.tenant_id()
    ))]
    async fn insert_audit_log(
        &self,
        ctx: &TenantContext,
        _entry: AuditLogEntry,
    ) -> StorageResult<()> {
        // TODO(#TBD, hardik, v1.1): Execute INSERT into audit_log table
        // Note: audit_log entries don't include tenant_id in the entry itself,
        // but we should enforce it from context.
        Ok(())
    }

    #[instrument(skip(self))]
    async fn health_check(&self) -> StorageResult<()> {
        // TODO(#TBD, hardik, v1.1): Execute simple SELECT 1 to verify connection
        Ok(())
    }

    fn backend_name(&self) -> &'static str {
        "duckdb"
    }

    fn latency_stats(&self) -> LatencyStats {
        // TODO(#TBD, hardik, v1.1): Return actual latency statistics
        LatencyStats {
            p50_ms: 0.0,
            p99_ms: 0.0,
            total_queries: 0,
            total_events_inserted: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_duckdb_new() {
        // TODO(#TBD, hardik, v1.1): Test DuckDB engine creation
    }

    #[tokio::test]
    async fn test_duckdb_health_check() {
        // TODO(#TBD, hardik, v1.1): Test health check
    }
}
