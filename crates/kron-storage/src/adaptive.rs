//! Adaptive storage backend selection.
//!
//! [`AdaptiveStorage`] reads the [`KronConfig`] and instantiates
//! either `DuckDB` or `ClickHouse` based on the deployment mode.
//!
//! This enables the same code to work across Nano (`DuckDB`),
//! Standard (`ClickHouse`), and Enterprise (`ClickHouse` sharded) deployments.

use crate::clickhouse::ClickHouseEngine;
use crate::duckdb::DuckDbEngine;
use crate::tenant::TenantStore;
use crate::traits::{AuditLogEntry, LatencyStats, StorageEngine, StorageResult};
use async_trait::async_trait;
use kron_types::KronError;
use kron_types::{DeploymentMode, KronAlert, KronConfig, KronEvent, TenantContext};
use std::sync::Arc;
use tracing::info;

/// Enum of supported storage backends.
#[derive(Clone)]
enum BackendEnum {
    DuckDb(std::sync::Arc<DuckDbEngine>),
    ClickHouse(std::sync::Arc<ClickHouseEngine>),
}

/// Adaptive storage engine that selects `DuckDB` or `ClickHouse` from config.
///
/// Also holds the [`TenantStore`] for MSSP tenant lifecycle management.
/// `tenants` is the only cross-tenant data store; all other fields are per-tenant.
///
/// # Usage
/// ```ignore
/// let config = KronConfig::from_file("config.toml")?;
/// let storage = AdaptiveStorage::new(&config).await?;
///
/// let ctx = TenantContext::new(tenant_id, user_id, "viewer");
/// let events = storage.query_events(&ctx, None, 1000).await?;
///
/// // Tenant management (super_admin only, enforced at handler layer):
/// storage.tenants.insert(record).await?;
/// ```
pub struct AdaptiveStorage {
    backend: BackendEnum,
    /// Cross-tenant registry for MSSP tenant lifecycle (create, config, offboard).
    pub tenants: Arc<TenantStore>,
}

impl AdaptiveStorage {
    /// Create a new adaptive storage instance from configuration.
    ///
    /// # Arguments
    /// * `config` - Full KRON configuration (determines deployment mode)
    ///
    /// # Returns
    /// Initialized storage engine, or error if backend cannot be reached.
    ///
    /// # Errors
    /// Returns `KronError::Storage` if the selected backend cannot be reached or initialized.
    ///
    /// # Deployment Mode Selection
    /// - Nano → `DuckDB` at `config.duckdb.path`
    /// - Standard/Enterprise → `ClickHouse` at `config.clickhouse.url`
    pub async fn new(config: &KronConfig) -> StorageResult<Self> {
        let backend = match config.mode {
            DeploymentMode::Nano => {
                info!("Initializing Nano tier storage (DuckDB)");
                let db_path = config.duckdb.path.to_string_lossy();
                let migrations_dir = config.duckdb.migrations_dir.to_string_lossy();
                let engine = DuckDbEngine::new(&db_path, &migrations_dir)
                    .map_err(|e| KronError::Storage(format!("DuckDB init failed: {e}")))?;
                engine.apply_migrations().await?;
                BackendEnum::DuckDb(std::sync::Arc::new(engine))
            }
            DeploymentMode::Standard => {
                info!("Initializing Standard tier storage (ClickHouse)");
                let migrations_dir = config.clickhouse.migrations_dir.to_string_lossy();
                let engine = ClickHouseEngine::new(&config.clickhouse, &migrations_dir).await?;
                engine.apply_migrations().await?;
                BackendEnum::ClickHouse(std::sync::Arc::new(engine))
            }
            DeploymentMode::Enterprise => {
                info!("Initializing Enterprise tier storage (ClickHouse sharded)");
                // Sharding is handled at the ClickHouse cluster level.
                let migrations_dir = config.clickhouse.migrations_dir.to_string_lossy();
                let engine = ClickHouseEngine::new(&config.clickhouse, &migrations_dir).await?;
                engine.apply_migrations().await?;
                BackendEnum::ClickHouse(std::sync::Arc::new(engine))
            }
        };

        // Open tenant registry from the data directory.
        let data_dir = config.duckdb.path.parent().unwrap_or(std::path::Path::new("."));
        let tenant_store = TenantStore::open(data_dir).await.map_err(|e| {
            KronError::Storage(format!("failed to open tenant registry: {e}"))
        })?;

        Ok(Self {
            backend,
            tenants: Arc::new(tenant_store),
        })
    }
}

#[async_trait]
impl StorageEngine for AdaptiveStorage {
    async fn insert_events(
        &self,
        ctx: &TenantContext,
        events: Vec<KronEvent>,
    ) -> StorageResult<u64> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.insert_events(ctx, events).await,
            BackendEnum::ClickHouse(engine) => engine.insert_events(ctx, events).await,
        }
    }

    async fn query_events(
        &self,
        ctx: &TenantContext,
        filter: Option<crate::query::EventFilter>,
        limit: u32,
    ) -> StorageResult<Vec<KronEvent>> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.query_events(ctx, filter, limit).await,
            BackendEnum::ClickHouse(engine) => engine.query_events(ctx, filter, limit).await,
        }
    }

    async fn get_event(
        &self,
        ctx: &TenantContext,
        event_id: &str,
    ) -> StorageResult<Option<KronEvent>> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.get_event(ctx, event_id).await,
            BackendEnum::ClickHouse(engine) => engine.get_event(ctx, event_id).await,
        }
    }

    async fn insert_alerts(
        &self,
        ctx: &TenantContext,
        alerts: Vec<KronAlert>,
    ) -> StorageResult<u64> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.insert_alerts(ctx, alerts).await,
            BackendEnum::ClickHouse(engine) => engine.insert_alerts(ctx, alerts).await,
        }
    }

    async fn query_alerts(
        &self,
        ctx: &TenantContext,
        limit: u32,
        offset: u32,
    ) -> StorageResult<Vec<KronAlert>> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.query_alerts(ctx, limit, offset).await,
            BackendEnum::ClickHouse(engine) => engine.query_alerts(ctx, limit, offset).await,
        }
    }

    async fn get_alert(
        &self,
        ctx: &TenantContext,
        alert_id: &str,
    ) -> StorageResult<Option<KronAlert>> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.get_alert(ctx, alert_id).await,
            BackendEnum::ClickHouse(engine) => engine.get_alert(ctx, alert_id).await,
        }
    }

    async fn update_alert(&self, ctx: &TenantContext, alert: &KronAlert) -> StorageResult<()> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.update_alert(ctx, alert).await,
            BackendEnum::ClickHouse(engine) => engine.update_alert(ctx, alert).await,
        }
    }

    async fn insert_audit_log(
        &self,
        ctx: &TenantContext,
        entry: AuditLogEntry,
    ) -> StorageResult<()> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.insert_audit_log(ctx, entry).await,
            BackendEnum::ClickHouse(engine) => engine.insert_audit_log(ctx, entry).await,
        }
    }

    async fn health_check(&self) -> StorageResult<()> {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.health_check().await,
            BackendEnum::ClickHouse(engine) => engine.health_check().await,
        }
    }

    fn backend_name(&self) -> &'static str {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.backend_name(),
            BackendEnum::ClickHouse(engine) => engine.backend_name(),
        }
    }

    fn latency_stats(&self) -> LatencyStats {
        match &self.backend {
            BackendEnum::DuckDb(engine) => engine.latency_stats(),
            BackendEnum::ClickHouse(engine) => engine.latency_stats(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_adaptive_storage_duckdb() {
        // TODO(#TBD, hardik, v1.1): Test DuckDB path in AdaptiveStorage
    }

    #[tokio::test]
    async fn test_adaptive_storage_clickhouse() {
        // TODO(#TBD, hardik, v1.1): Test ClickHouse path in AdaptiveStorage
    }
}
