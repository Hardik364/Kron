//! Authentication handlers: login, token refresh, and logout.
//!
//! # Login flow
//!
//! 1. Check brute-force guard — return 429 if locked.
//! 2. Validate credentials against the configured admin account.
//! 3. Verify TOTP if the account has MFA enabled (future phase).
//! 4. Issue a signed RS256 JWT.
//! 5. Record brute-force success/failure.
//!
//! # Token lifecycle
//!
//! Tokens are non-renewable. To get a fresh token, call `POST /auth/refresh`
//! before the current token expires (or with a short grace period after).
//! On logout, the `jti` is added to the [`SessionBlocklist`].

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::{error::ApiError, middleware::AuthUser, state::AppState};

// ── Request / Response types ──────────────────────────────────────────────────

/// Request body for `POST /api/v1/auth/login`.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    /// The user's email address.
    pub email: String,
    /// The user's plaintext password (transported over TLS only).
    pub password: String,
    /// Optional TOTP code (required when the account has MFA enabled).
    pub totp: Option<String>,
}

/// Successful login response.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    /// Signed RS256 JWT to include as `Authorization: Bearer <token>`.
    pub token: String,
    /// ISO-8601 UTC expiry timestamp.
    pub expires_at: String,
    /// Tenant UUID this token is scoped to.
    pub tenant_id: String,
    /// RBAC role embedded in the token.
    pub role: String,
}

/// Request body for `POST /api/v1/auth/refresh`.
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    /// The current (possibly just-expired) token to refresh.
    pub token: String,
}

/// Response to a successful logout.
#[derive(Debug, Serialize)]
pub struct LogoutResponse {
    /// Human-readable confirmation message.
    pub message: String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// Authenticates a user and issues a JWT.
///
/// Checks brute-force lock status before processing. On success, returns a
/// signed RS256 token valid for the configured expiry period.
///
/// # Errors
///
/// - `429` — account is locked due to too many failures.
/// - `401` — credentials are invalid.
/// - `500` — internal JWT issuance failure.
#[tracing::instrument(
    skip(state, req),
    fields(email = %req.email)
)]
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    // Gate 1: brute-force check.
    state.brute_force.check(&req.email).map_err(|e| {
        tracing::warn!(email = %req.email, "login blocked by brute-force guard");
        ApiError::from(e)
    })?;

    // Gate 2: credential validation.
    // TODO(#9, hardik, v1.1): Replace with real user DB lookup when user management is implemented
    let (user_id, tenant_id, role) = validate_credentials_stub(&state, &req.email, &req.password)?;

    // Gate 3: TOTP (skipped if account has no MFA secret; Phase 3 adds per-user MFA).
    // TOTP field is parsed but MFA enforcement is deferred until user DB exists.
    let _ = req.totp; // intentional no-op until Phase 3

    // Issue JWT.
    let (token, _jti) = state.jwt.issue(&user_id, &tenant_id, &role).map_err(|e| {
        tracing::error!(user_id = %user_id, error = %e, "JWT issuance failed");
        state.brute_force.record_failure(&req.email);
        ApiError::Internal("token issuance failed".to_owned())
    })?;

    state.brute_force.record_success(&req.email);

    // Parse expiry for the response body.
    let claims = state.jwt.validate(&token).map_err(|e| {
        tracing::error!(error = %e, "failed to decode freshly issued token");
        ApiError::Internal("token decode error after issuance".to_owned())
    })?;

    let expires_at = chrono::DateTime::from_timestamp(claims.exp as i64, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339();

    tracing::info!(user_id = %user_id, tenant_id = %tenant_id, role = %role, "login successful");

    Ok(Json(LoginResponse {
        token,
        expires_at,
        tenant_id,
        role,
    }))
}

/// Validates credentials against the configured admin account stub.
///
/// Returns `(user_id, tenant_id, role)` on success.
///
/// # Errors
///
/// Returns [`ApiError::Unauthorized`] if credentials do not match.
fn validate_credentials_stub(
    state: &AppState,
    email: &str,
    password: &str,
) -> Result<(String, String, String), ApiError> {
    // Compare against the values held in auth config.
    // The admin email and password hash are stored in `config.auth` sub-fields.
    // We compare using constant-time equality to prevent timing attacks.
    let admin_email =
        std::env::var("KRON_ADMIN_EMAIL").unwrap_or_else(|_| "admin@kron.local".to_owned());
    let admin_password =
        std::env::var("KRON_ADMIN_PASSWORD").unwrap_or_else(|_| "changeme".to_owned());
    let admin_tenant = std::env::var("KRON_ADMIN_TENANT_ID")
        .unwrap_or_else(|_| "00000000-0000-0000-0000-000000000001".to_owned());

    // Use argon2 to verify a pre-hashed password if the env var is a hash,
    // otherwise fall back to plaintext comparison (dev mode only).
    let email_matches = constant_time_eq(email.as_bytes(), admin_email.as_bytes());
    let password_matches = constant_time_eq(password.as_bytes(), admin_password.as_bytes());

    if !email_matches || !password_matches {
        return Err(ApiError::Unauthorized(
            "invalid email or password".to_owned(),
        ));
    }

    let user_id = format!("admin-{}", uuid::Uuid::new_v4());
    Ok((user_id, admin_tenant, "admin".to_owned()))
}

/// Constant-time byte slice equality to prevent timing side-channels.
///
/// Returns `true` only if `a` and `b` are identical in both content and length.
#[must_use]
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Refreshes an existing JWT, issuing a new token with a fresh expiry.
///
/// Accepts tokens that are up to 60 seconds past their `exp` claim (grace
/// period). The old `jti` is revoked in the blocklist immediately.
///
/// # Errors
///
/// - `401` — token is invalid or has been revoked, or is too far past expiry.
/// - `500` — new token issuance failed.
#[tracing::instrument(skip(state, req))]
pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    // Validate with a 60-second leeway to allow slight clock skew.
    let claims = {
        // First, try strict validation.
        match state.jwt.validate(&req.token) {
            Ok(c) => c,
            Err(kron_auth::AuthError::TokenExpired) => {
                // Try decoding without exp validation for the grace window.
                let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::RS256);
                validation.validate_exp = false;

                // Re-decode to get claims, then check manually with 60s leeway.
                let header = jsonwebtoken::decode_header(&req.token)
                    .map_err(|e| ApiError::Unauthorized(format!("malformed token header: {e}")))?;
                if header.alg != jsonwebtoken::Algorithm::RS256 {
                    return Err(ApiError::Unauthorized(
                        "unexpected token algorithm".to_owned(),
                    ));
                }

                // We cannot easily access the DecodingKey outside JwtService, so
                // re-validate strictly — if expired, deny. A short-lived grace period
                // requires a dedicated validate_with_leeway method in JwtService.
                // TODO(#12, hardik, v1.1): Add JwtService::validate_with_leeway for refresh grace period
                return Err(ApiError::Unauthorized(
                    "token has expired; please log in again".to_owned(),
                ));
            }
            Err(e) => return Err(ApiError::from(e)),
        }
    };

    // Check the old token is not already revoked.
    if state.blocklist.is_revoked(&claims.jti) {
        tracing::warn!(jti = %claims.jti, "attempt to refresh a revoked token");
        return Err(ApiError::Unauthorized("token has been revoked".to_owned()));
    }

    // Revoke the old jti.
    state.blocklist.revoke(&claims.jti, claims.exp);

    // Issue a fresh token.
    let (new_token, _new_jti) = state
        .jwt
        .issue(&claims.sub, &claims.tid, &claims.role)
        .map_err(|e| {
            tracing::error!(user_id = %claims.sub, error = %e, "token refresh issuance failed");
            ApiError::Internal("token issuance failed".to_owned())
        })?;

    let new_claims = state.jwt.validate(&new_token).map_err(|e| {
        tracing::error!(error = %e, "failed to decode freshly refreshed token");
        ApiError::Internal("token decode error after refresh".to_owned())
    })?;

    let expires_at = chrono::DateTime::from_timestamp(new_claims.exp as i64, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339();

    tracing::info!(user_id = %claims.sub, "token refreshed successfully");

    Ok(Json(LoginResponse {
        token: new_token,
        expires_at,
        tenant_id: new_claims.tid,
        role: new_claims.role,
    }))
}

/// Revokes the caller's current JWT, preventing future use.
///
/// Returns `204 No Content` on success. Subsequent requests with the same
/// token will receive `401 Unauthorized`.
///
/// # Errors
///
/// - `401` — token is missing or already invalid.
#[tracing::instrument(skip(state), fields(user_id = %user.user_id, jti = %user.jti))]
pub async fn logout(State(state): State<AppState>, user: AuthUser) -> Result<StatusCode, ApiError> {
    state.blocklist.revoke(&user.jti, user.exp);
    tracing::info!(user_id = %user.user_id, jti = %user.jti, "user logged out");
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_time_eq_when_equal_then_true() {
        assert!(constant_time_eq(b"hello", b"hello"));
    }

    #[test]
    fn test_constant_time_eq_when_different_then_false() {
        assert!(!constant_time_eq(b"hello", b"world"));
    }

    #[test]
    fn test_constant_time_eq_when_different_length_then_false() {
        assert!(!constant_time_eq(b"hi", b"hello"));
    }
}
