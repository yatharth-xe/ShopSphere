# ShopSphere

ShopSphere is a multi-vendor e-commerce application developed as a Software Engineering course project. Customers can browse a shared catalogue and place multi-store orders; sellers manage stores and products; administrators moderate marketplace data; and support agents handle tickets.

The project demonstrates requirements-driven modular design with a React frontend, Express REST API, MongoDB/Mongoose persistence, role-based security, validation, and automated backend tests.

## Main features

- Public active-product catalogue with variants, categories, search/filtering, reviews, and wishlist support.
- Customer registration/login, profile and address management, cart, checkout request, order history, and support tickets.
- Seller store setup, product create/edit/archive, seller dashboard, stock update validation, and seller order/return views.
- Admin dashboards plus user, staff, category, store, and product moderation tools.
- Support ticket conversations, assignment, and status updates.
- JWT access/refresh authentication, role protection, request validation, rate limiting, and forced staff password changes.
- Stage 3 inventory service and immutable inventory-effect ledger, currently integrated with seller stock/product edits and covered by replica-set tests.

## Current implementation boundary

Stage 3 inventory infrastructure is implemented and tested, but it is **not yet integrated** with checkout, order-status changes, or returns/refunds. A real payment gateway is not implemented; orders store payment method/status metadata only. The delivery dashboard is not demo-ready because its frontend expects API endpoints that the backend does not currently expose.

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS, Axios, Lucide React |
| Backend | Node.js, Express 5, MongoDB, Mongoose 9 |
| Security/validation | JWT, bcrypt, Zod, express-rate-limit |
| Testing | node:test, Supertest, mongodb-memory-server |
| Optional AI integrations | Groq text generation and Google Gemini embeddings |

## Screenshots

No repository-managed screenshots are currently available. Add verified screenshots before final submission if desired.

```text
Suggested screenshots:
- Customer catalogue/cart/checkout
- Seller product management
- Admin moderation dashboard
- Support ticket workflow
```

## Quick start

### Prerequisites

- Node.js compatible with the lockfiles.
- MongoDB connection for normal backend use. Use a replica set for transaction-capable inventory development.
- Optional Groq/Gemini keys only if demonstrating AI routes.

### Backend

```bash
cd backend
npm install
node server.js
```

The backend defaults to port `5000`. There is no `npm run dev` script in the current backend package.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Important: `frontend/src/api/axiosInstance.js` currently targets the deployed Render API URL. Starting the frontend locally does not automatically direct it to a locally started backend; verify the intended environment pairing before a demo.

## Environment variables

Create `backend/.env` without committing it:

```env
PORT=5000
MONGODB_URI=<MongoDB connection URI>
ACCESS_TOKEN_SECRET=<random secret>
REFRESH_TOKEN_SECRET=<different random secret>
GROQ_API_KEY=<optional>
GEMINI_API_KEY=<optional>
EXPOSE_DEV_RESET_TOKEN=false
```

`NODE_ENV` also affects password-reset behavior. Production password-reset email delivery is not configured. Never commit secrets, tokens, API keys, or passwords.

## Testing

```bash
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

The latest confirmed backend test result is **37 passing tests**. Backend tests use an isolated in-memory MongoDB replica set and do not connect to `MONGODB_URI` or a real ShopSphere database. The latest confirmed frontend lint run had no errors and 12 existing warnings; the production build passed.

## Documentation

- [Project overview](docs/01-project-overview.md)
- [Architecture and folder structure](docs/02-architecture-and-folder-structure.md)
- [Data model and roles](docs/03-data-model-and-roles.md)
- [API overview](docs/04-api-overview.md)
- [Security and authentication](docs/05-security-and-authentication.md)
- [Commerce and inventory workflows](docs/06-commerce-and-inventory-workflows.md)
- [Setup, testing, and demo preparation](docs/07-setup-testing-and-demo.md)
- [Known limitations and future work](docs/08-known-limitations-and-future-work.md)
- [Live demonstration runbook](docs/09-demo-runbook.md)

## Demonstration note

Use dedicated demo data and accounts. Confirm an existing admin account, an approved seller store, an active product with stock, and customer/support accounts before the live demonstration. See the [demo runbook](docs/09-demo-runbook.md).
