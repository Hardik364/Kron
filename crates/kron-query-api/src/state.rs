//! Shared application state injected into every Axum handler.
//!
//! [`AppState`] is constructed once at startup and cloned into each request
//! via Axum's [`axum::extract::State`] extractor. All fields are `Arc`-wrapped
//! so cloning is cheap.
//!
//! # Security note
//!
//! `tenant_id` is **never** stored here. It is extracted from the validated
//! JWT on every request and lives only in [`crate::middleware::AuthUser`].

use std::sync::Arc;
use std::time::Instant;

use jsonwebtoken::{DecodingKey, EncodingKey};
use kron_types::KronConfig;

/// JWT claims structure embedded in every KRON access token.
///
/// All fields map directly to registered (`sub`, `exp`, `iat`, `jti`) and
/// private (`tid`, `role`) JWT claims. The `jti` uniquely identifies the
/// token for revocation purposes.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KronClaims {
    /// Subject: the user ID string.
    pub sub: String,
    /// Tenant ID this token is scoped to.
    pub tid: String,
    /// RBAC role name (e.g. `"admin"`, `"analyst"`).
    pub role: String,
    /// JWT ID — a UUID v4 used to revoke individual tokens.
    pub jti: String,
    /// Issued-at timestamp (Unix seconds).
    pub iat: u64,
    /// Expiry timestamp (Unix seconds).
    pub exp: u64,
}

/// Service that issues and validates KRON JWTs using RS256.
///
/// Holds the encoding key (private) and decoding key (public). The private
/// key is only held in memory and never written to a response.
pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    /// Token validity window in seconds (from config).
    pub expiry_secs: u64,
}

impl JwtService {
    /// Creates a new `JwtService` from RSA PEM key bytes.
    ///
    /// # Arguments
    /// * `private_pem` - RSA private key in PEM format (PKCS#8 or traditional)
    /// * `public_pem`  - RSA public key in PEM format
    /// * `expiry_secs` - Token validity in seconds
    ///
    /// # Errors
    ///
    /// Returns an error string if either PEM is malformed.
    pub fn from_pem(
        private_pem: &[u8],
        public_pem: &[u8],
        expiry_secs: u64,
    ) -> Result<Self, String> {
        let encoding_key = EncodingKey::from_rsa_pem(private_pem)
            .map_err(|e| format!("invalid RSA private key: {e}"))?;
        let decoding_key = DecodingKey::from_rsa_pem(public_pem)
            .map_err(|e| format!("invalid RSA public key: {e}"))?;
        Ok(Self {
            encoding_key,
            decoding_key,
            expiry_secs,
        })
    }

    /// Issues a signed RS256 JWT for the given user.
    ///
    /// # Arguments
    /// * `user_id`   - Subject claim value
    /// * `tenant_id` - Tenant UUID string
    /// * `role`      - RBAC role string
    ///
    /// # Returns
    ///
    /// A signed JWT string and the `jti` UUID for revocation tracking.
    ///
    /// # Errors
    ///
    /// Returns an error string if JWT encoding fails.
    pub fn issue(
        &self,
        user_id: &str,
        tenant_id: &str,
        role: &str,
    ) -> Result<(String, String), String> {
        use std::time::{SystemTime, UNIX_EPOCH};

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("system clock error: {e}"))?
            .as_secs();

        let jti = uuid::Uuid::new_v4().to_string();
        let claims = KronClaims {
            sub: user_id.to_owned(),
            tid: tenant_id.to_owned(),
            role: role.to_owned(),
            jti: jti.clone(),
            iat: now,
            exp: now + self.expiry_secs,
        };

        let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
        let token = jsonwebtoken::encode(&header, &claims, &self.encoding_key)
            .map_err(|e| format!("JWT encode error: {e}"))?;

        Ok((token, jti))
    }

    /// Validates a JWT and returns the embedded claims.
    ///
    /// Verifies the RS256 signature, `exp` claim, and required fields.
    ///
    /// # Errors
    ///
    /// Returns [`kron_auth::AuthError`] if the token is invalid, expired, or
    /// structurally malformed.
    pub fn validate(&self, token: &str) -> Result<KronClaims, kron_auth::AuthError> {
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::RS256);
        validation.validate_exp = true;

        jsonwebtoken::decode::<KronClaims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
                    kron_auth::AuthError::TokenExpired
                }
                _ => kron_auth::AuthError::TokenInvalid(e.to_string()),
            })
    }

    /// Returns the RSA public key in JWK set format for `/.well-known/jwks.json`.
    ///
    /// # Errors
    ///
    /// Returns an error string if JWK conversion fails.
    pub fn public_jwks(&self) -> Result<serde_json::Value, String> {
        // The full JWK conversion requires the raw public key bytes. For now we
        // return a minimal structure indicating RS256 usage. A complete
        // implementation will extract `n` and `e` modulus/exponent fields.
        // TODO(#11, hardik, v1.1): Extract RSA n/e from DecodingKey for full JWK response
        Ok(serde_json::json!({
            "keys": [{
                "kty": "RSA",
                "alg": "RS256",
                "use": "sig"
            }]
        }))
    }
}

/// In-memory token revocation list (logout invalidation).
///
/// Stores revoked JWT IDs (`jti` claims) with their expiry timestamps so the
/// set can be pruned without retaining tokens beyond their natural lifetime.
pub struct SessionBlocklist {
    inner: dashmap::DashMap<String, u64>,
}

impl SessionBlocklist {
    /// Creates an empty blocklist.
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: dashmap::DashMap::new(),
        }
    }

    /// Marks a token as revoked.
    ///
    /// # Arguments
    /// * `jti`        - The JWT ID to revoke
    /// * `expires_at` - Unix timestamp when this token would have naturally expired.
    ///                  Used by [`Self::evict_expired`] to prune the set.
    pub fn revoke(&self, jti: &str, expires_at: u64) {
        self.inner.insert(jti.to_owned(), expires_at);
    }

    /// Returns `true` if the given `jti` has been revoked.
    #[must_use]
    pub fn is_revoked(&self, jti: &str) -> bool {
        self.inner.contains_key(jti)
    }

    /// Removes entries whose natural expiry has already passed.
    ///
    /// Call periodically (e.g. every 5 minutes) to bound memory usage.
    pub fn evict_expired(&self) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        self.inner.retain(|_, exp| *exp > now);
    }
}

impl Default for SessionBlocklist {
    fn default() -> Self {
        Self::new()
    }
}

/// Rate-limiting guard for authentication endpoints.
///
/// Tracks failed login attempts per email address and locks accounts that
/// exceed the configured threshold within a sliding window.
pub struct BruteForceGuard {
    /// Map of email → (fail_count, window_start_instant).
    inner: dashmap::DashMap<String, (u8, Instant)>,
    /// Maximum failures before lockout.
    max_attempts: u8,
    /// Lockout duration in seconds.
    lockout_secs: u64,
}

impl BruteForceGuard {
    /// Creates a new guard with the given thresholds.
    #[must_use]
    pub fn new(max_attempts: u8, lockout_secs: u64) -> Self {
        Self {
            inner: dashmap::DashMap::new(),
            max_attempts,
            lockout_secs,
        }
    }

    /// Checks whether `email` is currently locked out.
    ///
    /// # Returns
    /// `Ok(())` if the account may attempt a login, or
    /// `Err(AuthError::AccountLocked)` with the remaining lockout seconds.
    ///
    /// # Errors
    ///
    /// Returns [`kron_auth::AuthError::AccountLocked`] when the account is locked.
    pub fn check(&self, email: &str) -> Result<(), kron_auth::AuthError> {
        if let Some(entry) = self.inner.get(email) {
            let (count, window_start) = *entry;
            let elapsed_secs = window_start.elapsed().as_secs();
            if count >= self.max_attempts {
                if elapsed_secs < self.lockout_secs {
                    let retry_after_secs = self.lockout_secs - elapsed_secs;
                    return Err(kron_auth::AuthError::AccountLocked { retry_after_secs });
                }
                // Lockout window has expired — reset the counter below.
                drop(entry);
                self.inner.remove(email);
            }
        }
        Ok(())
    }

    /// Records a failed login attempt for `email`.
    pub fn record_failure(&self, email: &str) {
        let mut entry = self
            .inner
            .entry(email.to_owned())
            .or_insert((0, Instant::now()));
        let (count, window_start) = entry.value_mut();
        // If the lockout window has expired, reset the counter.
        if window_start.elapsed().as_secs() >= self.lockout_secs {
            *count = 0;
            *window_start = Instant::now();
        }
        *count = count.saturating_add(1);
    }

    /// Records a successful login — clears any existing failure counter.
    pub fn record_success(&self, email: &str) {
        self.inner.remove(email);
    }

    /// Removes entries whose lockout window has expired.
    ///
    /// Call periodically (e.g. every 5 minutes) to bound memory usage.
    pub fn evict_expired(&self) {
        self.inner
            .retain(|_, (_, window_start)| window_start.elapsed().as_secs() < 900);
    }
}

/// Shared application state for all Axum handlers.
///
/// Constructed once at startup. All fields are `Arc`-backed so that
/// `AppState::clone()` is O(1) and safe across async tasks.
#[derive(Clone)]
pub struct AppState {
    /// Unified storage backend (ClickHouse or DuckDB depending on tier).
    pub storage: Arc<kron_storage::AdaptiveStorage>,
    /// Message bus producer for publishing events from API handlers.
    pub bus: Arc<dyn kron_bus::BusProducer + Send + Sync>,
    /// JWT issuance and validation service.
    pub jwt: Arc<JwtService>,
    /// Brute-force login protection guard.
    pub brute_force: Arc<BruteForceGuard>,
    /// Revoked token blocklist for logout invalidation.
    pub blocklist: Arc<SessionBlocklist>,
    /// Full platform configuration.
    pub config: Arc<KronConfig>,
}
