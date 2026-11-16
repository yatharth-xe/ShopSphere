# Security and Authentication

## Authentication design

1. Login and successful public registration return an access token and refresh token.
2. The frontend stores both in `localStorage` and sends the access token as a bearer header.
3. The Axios interceptor coordinates one in-flight refresh request and retries a failed request once with the new access token.
4. Refresh tokens are rotated by the backend and replay is rejected by the tested implementation.

This is the current design; tokens have not been migrated to HttpOnly cookies.

## Authorization

`verifyToken` verifies the JWT and loads the active user. `verifyRole` restricts routes by role. The frontend additionally uses `ProtectedRoute` for role-specific page access; server-side checks remain the security boundary.

## Account provisioning

- `POST /api/auth/register` accepts customer registration only.
- `POST /api/users/staff` is admin-only and can create seller, support, or delivery users.
- Staff accounts receive a temporary password and `mustChangePassword`; protected actions are restricted until password change.
- The endpoint cannot create an admin user. Admin bootstrap is an operational task, not public functionality.

## Validation and rate limiting

Zod schemas validate authentication, order/cart quantity, product stock/variants, and support ticket payloads. Authentication and password-related routes use `express-rate-limit` with a single-instance configuration appropriate for the project environment.

## Password reset limitation

No email provider is configured. Production password-reset responses are generic and do not expose a usable reset token. For non-production development only, `EXPOSE_DEV_RESET_TOKEN=true` can expose a development token; it must not be enabled in production.

## Tested security evidence

The backend test suite covers customer-only registration, staff provisioning restrictions, forced password change, refresh-token rotation/replay behavior, simultaneous refresh attempts, reset-token exposure rules, support ticket ownership, and login rate limiting. See [Setup, testing, and demo](07-setup-testing-and-demo.md).
