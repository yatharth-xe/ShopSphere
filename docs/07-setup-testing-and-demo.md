# Setup, Testing, and Demo Preparation

## Prerequisites

- Node.js compatible with the installed dependencies.
- MongoDB for normal backend operation. A replica set is required for transaction-capable inventory work.
- Optional Groq and Gemini credentials only when demonstrating AI features.

## Backend environment

Create `backend/.env` with values appropriate for the environment:

```env
PORT=5000
MONGODB_URI=<MongoDB connection URI>
ACCESS_TOKEN_SECRET=<random secret>
REFRESH_TOKEN_SECRET=<different random secret>
GROQ_API_KEY=<optional for AI features>
GEMINI_API_KEY=<optional for AI features>
EXPOSE_DEV_RESET_TOKEN=false
```

`NODE_ENV` is read by password-reset behavior. Never commit secrets, tokens, credentials, or real user information.

## Bootstrap the first local development admin

Public registration creates customer accounts only, and the staff endpoint cannot create admins. For a fresh local demo database, the repository provides an explicit one-time bootstrap command. It is guarded by both `NODE_ENV=development` and an exact MongoDB URI match for `mongodb://127.0.0.1:27018/shopsphere_demo?replicaSet=rs0`. It refuses to proceed if any admin already exists or the requested email belongs to any existing account.

From `backend/`, supply the name, email, and password as temporary process environment variables using a local secret manager or another method that does not put the password in shell history or command-line arguments. For example, set the non-secret guards in PowerShell:

```powershell
$env:NODE_ENV = "development"
$env:MONGODB_URI = "mongodb://127.0.0.1:27018/shopsphere_demo?replicaSet=rs0"
$env:ADMIN_NAME = "Local Demo Admin"
$env:ADMIN_EMAIL = "admin@example.test"
```

Set `ADMIN_PASSWORD` through the chosen local secret mechanism, then invoke:

```powershell
npm run bootstrap:local-admin
```

The script reuses `registerSchema` for name/email/password validation and `UserModel.save()` for the existing bcrypt password hook. It does not expose an HTTP endpoint and does not update or elevate an existing account. It never prints the password and disconnects from MongoDB on success or failure. Do not store the admin password in `.env`, source control, terminal transcripts, or project documentation. Remove temporary environment values from the shell after use.

For a local single-node replica set, MongoDB can be launched with a replica-set name and initialized once. The exact data-directory path is environment-specific:

```bash
mongod --replSet rs0 --dbpath <data-directory>
mongosh --eval "rs.initiate()"
```

## Commands actually present in the repository

```bash
# Backend
cd backend
npm install
node server.js

# Backend tests
cd backend
npm test

# Frontend
cd frontend
npm install
npm run dev

# Frontend quality checks
npm run lint
npm run build
```

The backend source defaults to port `5000` when `PORT` is absent. There is no backend `npm run dev` script in `backend/package.json`.

## Frontend API configuration

`frontend/src/api/axiosInstance.js` currently hard-codes the deployed Render API URL:

```text
https://shopsphere-4c0v.onrender.com/api
```

Therefore, starting the frontend locally does not automatically direct it to a locally started backend. Verify the intended frontend/backend pairing before a demonstration.

## Test results recorded for this repository state

The latest confirmed backend test run completed with **37 passing tests**. The suite uses `mongodb-memory-server` with an isolated single-node replica set; it does not use `MONGODB_URI` or modify a development/production database.

The latest confirmed frontend checks completed with no lint errors (12 existing warnings) and a successful production build.

## Demo-data preparation

No seed script is present. Prepare dedicated demonstration accounts and data outside version control:

- Existing admin account.
- Seller with an approved store.
- Customer account.
- Support account.
- Approved active product with available stock.
- Optional pending store/product for moderation demonstration.

Use non-sensitive demo credentials and do not place passwords in repository documentation.
