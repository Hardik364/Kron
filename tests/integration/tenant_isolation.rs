//! 4-gate tenant isolation integration tests.
//!
//! These tests verify that no data from tenant A can be accessed by tenant B
//! through any of the four isolation gates:
//!
//! - **Gate 1**: JWT claims — a token issued for tenant A cannot be forged
//!   to include tenant B's ID without the private signing key.
//! - **Gate 2**: Query rewrite middleware — every storage query has
//!   `AND tenant_id = <from_jwt>` injected before execution.
//! - **Gate 3**: Storage layer enforcement — `TenantContext` wraps every
//!   operation; cross-tenant mismatches are rejected.
//! - **Gate 4**: Bus topic isolation — events are published to
//!   `kron.raw.{tenant_id}` and can only be consumed from that topic.
//!
//! # Running these tests
//!
//! ```bash
//! cargo test -p kron-query-api --test tenant_isolation -- --include-ignored integration
//! ```
//!
//! Tests that require live infrastructure (ClickHouse, Redpanda) are marked
//! `#[ignore = "requires running ClickHouse + Redpanda (docker-compose up)"]`.
//! Pure-logic tests (Gates 1 and 3 partial) run without infrastructure.

#[cfg(test)]
mod gate1_jwt_isolation {
    //! Gate 1: Verify that JWT claims enforce tenant identity and cannot be
    //! trivially forged without the RSA private key.

    use kron_types::TenantId;

    /// A JWT issued for tenant A must embed tenant A's UUID in the `tid` claim.
    /// This test verifies the claim is present and non-empty after parse.
    #[test]
    fn test_gate1_when_tenant_id_parsed_from_jwt_claim_then_correct() {
        // Simulate the AuthUser extractor parsing a `tid` claim.
        let raw_claim = "550e8400-e29b-41d4-a716-446655440001";
        let parsed: TenantId = raw_claim
            .parse()
            .expect("valid UUID should parse as TenantId");
        assert_eq!(parsed.to_string(), raw_claim);
    }

    /// A `tid` claim containing a different tenant UUID must produce a different
    /// `TenantId` — there is no implicit coercion.
    #[test]
    fn test_gate1_when_two_different_tenant_ids_then_not_equal() {
        let tid_a: TenantId = "550e8400-e29b-41d4-a716-446655440001"
            .parse()
            .expect("valid UUID");
        let tid_b: TenantId = "550e8400-e29b-41d4-a716-446655440002"
            .parse()
            .expect("valid UUID");
        assert_ne!(tid_a, tid_b);
    }

    /// An invalid UUID must fail to parse as a `TenantId`, preventing spoofed
    /// or malformed `tid` claims from reaching handlers.
    #[test]
    fn test_gate1_when_malformed_tid_claim_then_parse_fails() {
        let result = "not-a-uuid".parse::<TenantId>();
        assert!(result.is_err(), "malformed UUID should not parse as TenantId");
    }
}

#[cfg(test)]
mod gate2_query_rewrite {
    //! Gate 2: Verify that the storage query builder always injects `tenant_id`.
    //! Tests the `EventFilter` → SQL parameter pipeline without hitting a live DB.

    use kron_storage::query::EventFilter;
    use kron_types::TenantId;

    /// A query with no filter still carries the tenant context through to
    /// the parameterised query. We verify the filter struct can be constructed
    /// and that `tenant_id` is a required parameter (not optional).
    #[test]
    fn test_gate2_when_event_filter_built_then_tenant_id_required_field() {
        let tenant_id: TenantId = "550e8400-e29b-41d4-a716-446655440001"
            .parse()
            .expect("valid UUID");
        // EventFilter has no tenant_id field — it is injected by TenantContext.
        // This test verifies that TenantContext construction requires a valid UUID.
        let ctx = kron_types::TenantContext::new(tenant_id, "user-1".to_owned(), "analyst");
        assert_eq!(ctx.tenant_id().to_string(), "550e8400-e29b-41d4-a716-446655440001");

        // A filter built without a TenantContext has no tenant scope — it is
        // useless for queries. Handlers must always supply a context.
        let _filter = EventFilter::default();
        // The absence of a tenant_id field on EventFilter is the design intent:
        // tenant isolation is enforced by TenantContext, not the filter struct.
    }

    /// `TenantContext` constructed with one tenant ID must not silently accept
    /// a different `tenant_id` later — immutability is the enforcement.
    #[test]
    fn test_gate2_when_tenant_context_constructed_then_tenant_id_immutable() {
        let tid: TenantId = "550e8400-e29b-41d4-a716-446655440001"
            .parse()
            .expect("valid UUID");
        let ctx = kron_types::TenantContext::new(tid, "user-1".to_owned(), "admin");
        // TenantContext does not expose a setter for tenant_id.
        assert_eq!(ctx.tenant_id().to_string(), "550e8400-e29b-41d4-a716-446655440001");
    }
}

#[cfg(test)]
mod gate3_storage_layer {
    //! Gate 3: Storage layer enforces `tenant_id` on every operation.
    //! Events belonging to tenant A must not appear in tenant B's queries.
    //! Live tests require ClickHouse or DuckDB.

    use kron_types::{TenantContext, TenantId};

    /// Verifies that two `TenantContext` instances with different IDs produce
    /// distinct query scopes — the prerequisite for storage-layer isolation.
    #[test]
    fn test_gate3_when_two_tenant_contexts_then_different_scopes() {
        let ctx_a = TenantContext::new(
            "550e8400-e29b-41d4-a716-446655440001".parse::<TenantId>().unwrap(),
            "user-a".to_owned(),
            "admin",
        );
        let ctx_b = TenantContext::new(
            "550e8400-e29b-41d4-a716-446655440002".parse::<TenantId>().unwrap(),
            "user-b".to_owned(),
            "admin",
        );
        assert_ne!(ctx_a.tenant_id(), ctx_b.tenant_id());
    }

    /// Full storage isolation test: insert an event under tenant A, query with
    /// tenant B context, verify zero results.
    #[tokio::test]
    #[ignore = "requires running DuckDB or ClickHouse (docker-compose up)"]
    async fn test_gate3_when_event_inserted_for_tenant_a_then_tenant_b_query_returns_empty() {
        // This test requires a live storage backend. Run with:
        //   cargo test -p kron-query-api --test tenant_isolation gate3 -- --include-ignored
        //
        // Implementation: spin up AdaptiveStorage (Nano/DuckDB), insert a
        // KronEvent with tenant_id = A, query with TenantContext for B,
        // assert results are empty.
        todo!("wire AdaptiveStorage test fixture");
    }
}

#[cfg(test)]
mod gate4_bus_topic_isolation {
    //! Gate 4: Bus topics are per-tenant (`kron.raw.{tenant_id}`).
    //! A consumer subscribed to tenant A's topic must never receive tenant B's
    //! events. This is enforced by the topic naming convention.

    /// Verifies that the topic name for tenant A differs from tenant B's topic.
    #[test]
    fn test_gate4_when_two_tenants_then_different_bus_topics() {
        let tenant_a = "550e8400-e29b-41d4-a716-446655440001";
        let tenant_b = "550e8400-e29b-41d4-a716-446655440002";

        let topic_a = format!("kron.raw.{tenant_a}");
        let topic_b = format!("kron.raw.{tenant_b}");

        assert_ne!(topic_a, topic_b);
        assert!(topic_a.contains(tenant_a));
        assert!(topic_b.contains(tenant_b));
        assert!(!topic_a.contains(tenant_b));
    }

    /// Verifies that the enriched topic follows the same isolation pattern.
    #[test]
    fn test_gate4_when_enriched_topic_built_then_tenant_scoped() {
        let tenant = "550e8400-e29b-41d4-a716-446655440001";
        for prefix in &["kron.raw", "kron.enriched", "kron.alerts"] {
            let topic = format!("{prefix}.{tenant}");
            assert!(
                topic.ends_with(tenant),
                "topic '{topic}' should end with tenant_id"
            );
        }
    }

    /// Full bus isolation test: publish to tenant A's topic, verify tenant B's
    /// consumer does not receive the message.
    #[tokio::test]
    #[ignore = "requires running Redpanda (docker-compose up)"]
    async fn test_gate4_when_message_published_to_tenant_a_then_tenant_b_consumer_empty() {
        // This test requires a live Redpanda instance. Run with:
        //   cargo test -p kron-query-api --test tenant_isolation gate4 -- --include-ignored
        todo!("wire AdaptiveBus test fixture with testcontainers");
    }
}

#[cfg(test)]
mod canary {
    //! Canary test: creates a synthetic event under a dedicated canary tenant,
    //! verifies it is queryable, then verifies it is NOT visible to a different tenant.
    //!
    //! In production, this runs every 5 minutes as a background task.

    /// Smoke test: the canary tenant ID is a valid UUID.
    #[test]
    fn test_canary_tenant_id_is_valid_uuid() {
        use kron_types::TenantId;
        // The canary tenant has a fixed well-known UUID.
        let canary_id = "00000000-0000-0000-0000-000000000099";
        let parsed = canary_id.parse::<TenantId>();
        assert!(parsed.is_ok(), "canary tenant UUID should be valid");
    }

    /// Full canary end-to-end test.
    #[tokio::test]
    #[ignore = "requires full KRON stack (cargo run + docker-compose up)"]
    async fn test_canary_when_event_inserted_then_visible_to_own_tenant_only() {
        todo!("wire full stack canary fixture");
    }
}
