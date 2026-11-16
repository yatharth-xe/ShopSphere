# Known Limitations and Future Work

## Current limitations

| Area | Current state |
|---|---|
| Payments | Orders record a payment method/status, but no Razorpay or other payment gateway is implemented. |
| Checkout transactions | Checkout is not yet integrated with the Stage 3 inventory service and has no checkout idempotency key. |
| Order transitions | Existing status route is not yet transactionally integrated with inventory effects or the planned refined permission model. |
| Returns/refunds | Existing return workflow is not yet transactionally integrated with the inventory service. Partial-return workflow limitations remain. |
| Legacy orders | No automatic production-data migration or historical inventory inference is implemented. |
| Delivery UI | Backend exposes only `GET /api/delivery/my-deliveries`; the current delivery dashboard calls missing endpoints and is not demo-ready. |
| Local frontend/backend pairing | Axios uses a hard-coded deployed API URL rather than environment-based local configuration. |
| Seed data | There is no seed script or sample-data command. |
| Password reset delivery | Email delivery is unavailable; development-only reset-token exposure is opt-in. |
| AI | Description generation and semantic search depend on externally configured Groq/Gemini API keys and service availability. |

## Recommended next work

1. Integrate transactional inventory operations into checkout, order transitions, and return/refund routes.
2. Add customer-scoped checkout idempotency.
3. Complete delivery API/UI alignment and delivery assignment/status workflow.
4. Integrate Razorpay test mode with server-side payment verification.
5. Add route-level integration tests for checkout, lifecycle transitions, returns, permissions, and failures.
6. Add reproducible development seed data and environment-specific frontend API configuration.
7. Resolve existing lint warnings and Mongoose duplicate-index/deprecation warnings.

These items are future enhancements, not claims about the submitted implementation.
