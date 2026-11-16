# API Overview

All API routes are mounted below `/api`. Protected routes require `Authorization: Bearer <accessToken>` unless noted. This is an overview of routes implemented in `backend/api`; it is not a claim that every route has a complete frontend workflow.

| Area | Implemented routes |
|---|---|
| Authentication | `POST /auth/register`, `/login`, `/refresh-token`, `/logout`, `/forgot-password`, `/reset-password`; `GET /auth/me`, `/auth/verify-email/:token`; `PATCH /auth/change-password`, `/auth/force-change-password`. |
| Users/staff | `POST /users/staff`; `GET/PATCH /users/me`; `GET/POST /users/me/addresses`; `PATCH/DELETE /users/me/addresses/:id`; `GET /users`; `PATCH /users/:id/status`. |
| Stores | `POST/GET /stores`; `GET /stores/admin/all`; `GET /stores/:id`, `/stores/:id/products`; `PATCH /stores/:id`, `/stores/:id/status`. |
| Categories | `GET/POST /categories`; `PATCH/DELETE /categories/:id`. |
| Products | `GET/POST /products`; `GET /products/admin/all`, `/products/:id`; `PATCH/DELETE /products/:id`; `PATCH /products/:id/status`; `PATCH /products/:id/variants/:variantId/stock`. |
| Cart | `GET /cart`; `POST /cart/items`; `PATCH/DELETE /cart/items/:itemId`; `DELETE /cart`. |
| Orders | `POST /orders/checkout`; `GET /orders`, `/orders/:id`; `PATCH /orders/:id/suborders/:subOrderId/status`; `PATCH /orders/:id/suborders/:subOrderId/assign-delivery`. |
| Returns | `POST/GET /returns`; `PATCH /returns/:id/status`. |
| Support | `POST/GET /support`; `GET /support/:id`; `POST /support/:id/messages`; `PATCH /support/:id/assign`, `/support/:id/status`. |
| Reviews | `GET /reviews/product/:productId`, `/reviews/pending`; `POST /reviews`; `PATCH /reviews/:id/reply`, `/reviews/:id/moderate`. |
| Wishlist | `GET /wishlist`; `POST/DELETE /wishlist/:productId`. |
| Coupons | `POST/GET /coupons`; `POST /coupons/validate`; `PATCH/DELETE /coupons/:id`. |
| Notifications | `GET /notifications`; `PATCH /notifications/:id/read`, `/notifications/read-all`. |
| Delivery | `GET /delivery/my-deliveries` only. |
| Dashboards/audit | `GET /dashboard/seller`, `/dashboard/admin`, `/audit-logs`. |
| AI | `POST /ai/generate-description/:productId`, `/ai/index-product/:productId`; `GET /ai/semantic-search`. |

## Status and role notes

- Product create/edit/stock routes are seller-protected; product status is admin-moderated.
- Cart and checkout are customer-only.
- The order status endpoint currently applies its own role checks and state-machine validation. Its inventory logic is not yet integrated with the Stage 3 service.
- The delivery frontend currently calls endpoints not listed above; see [Known limitations](08-known-limitations-and-future-work.md).
- Input validation is strongest on auth, cart/order quantity, product stock/variant, and support endpoints. Some older route modules still use local/manual validation.
