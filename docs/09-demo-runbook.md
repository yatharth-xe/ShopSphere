# Live Demonstration Runbook

## Before the presentation

1. Open the intended deployment early; Render may take time to wake after inactivity.
2. Confirm the frontend is connected to the intended API and database.
3. Confirm admin, seller, customer, and support demo accounts exist.
4. Confirm an approved active product has available stock.
5. Keep terminal evidence of `npm test` showing 37 passing tests.
6. Keep screenshots or a short recording of the happy path as a network fallback.

## Nine-minute sequence

| Time | Presenter action | What to say |
|---:|---|---|
| 0:00–0:45 | Show home page and architecture slide/document. | ShopSphere is a multi-vendor marketplace built with React, Express, and MongoDB. |
| 0:45–2:15 | Customer login/register, browse an active product, choose a variant, add it to cart. | Catalog data is public; cart actions require a customer account. |
| 2:15–3:15 | Show cart and submit a checkout using a prepared address. | Checkout creates a multi-vendor order structure; payment is currently recorded as metadata, not processed by a gateway. |
| 3:15–4:30 | Seller login, store/product page, and product edit or stock update. | Seller inventory updates preserve reservations and validate stock constraints. |
| 4:30–5:45 | Admin dashboard and product/store moderation. | Admins control approval workflows and can provision seller/support/delivery staff. |
| 5:45–7:00 | Customer submits a support ticket using the support widget; support user opens queue, replies, and updates status. | Ticket ownership and agent access are role-controlled. |
| 7:00–8:15 | Show inventory documentation and test result. | Stage 3 introduced tested inventory service/ledger infrastructure; checkout/order/return integration is planned next. |
| 8:15–9:00 | Show limitations/future-work document. | Explain payment, delivery, and transaction integration honestly. |

## Do not make these primary demo steps

- Delivery dashboard: its frontend expects endpoints the backend does not implement.
- AI generation/search: only show after confirming external keys/services work.
- Return/refund completion: it exists in code but is not yet Stage 6 transactionally integrated.
- Seller order status changes: preflight them first with isolated demo data.

## Recovery plan

| Risk | Backup |
|---|---|
| Hosted backend cold start | Start it before the session; narrate architecture while it wakes. |
| Missing demo data | Use pre-created active product and accounts; keep a prepared screenshot. |
| Network failure | Show local source, documentation, diagrams, and captured test results. |
| Role/account problem | Use prepared account list stored outside the repository; never display passwords. |
| Time pressure | Skip optional seller/admin actions and complete customer flow plus tests/architecture. |
