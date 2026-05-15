# DROPPAD — VIBE CODING MASTER SPEC (LOCAL + DEPLOY READY)

# PROJECT OVERVIEW

DropPad คือ Temporary Workspace สำหรับทีม developer ขนาดเล็ก (3–5 คน)

Purpose:

* แชร์ข้อความ
* แชร์ code snippet
* แชร์ไฟล์
* แชร์รูปภาพ
* ใช้งานระหว่าง VM ↔ Local
* ใช้แทน clipboard/file transfer ที่ถูก block

Core principles:

* simple
* fast
* secure enough for internal usage
* temporary
* lightweight
* self-hostable
* free-tier friendly

---

# CORE ENGINEERING RULES

## 1. DO NOT MODIFY UNRELATED CODE

Forbidden:

* refactor unrelated modules
* rename unrelated variables
* reformat unrelated files
* change architecture without request

Allowed:

* minimal impact changes only
* isolated modifications
* backward compatible updates

---

## 2. NO HARDCODING

Never hardcode:

* API URLs
* secrets
* ports
* expiration values
* upload limits
* storage paths
* environment names

Must use:

* environment variables
* config abstraction
* constants

---

## 3. NEVER AUTO PUSH GIT

Forbidden:

* auto push
* auto commit
* auto release
* CI auto deploy production

Allowed:

* generate commit suggestions only

---

## 4. NEVER COMMIT SECRETS

Must ignore:

* .env
* .env.local
* .env.production
* credentials/*
* uploads/*
* storage/*
* temp/*
* logs/*
* coverage/*
* node_modules/*
* dist/*
* build/*

Must validate:

* no secrets leaked
* no access keys committed

---

## 5. TEST EVERYTHING

Every feature must include:

* unit tests
* edge case tests
* validation tests
* failure tests
* integration tests

---

# TARGET USERS

Internal dev team:

* 3–5 users
* trusted environment
* quick temporary sharing
* VM restricted workflow

Not intended for:

* public anonymous uploads
* permanent storage
* social sharing platform

---

# RECOMMENDED STACK

## Frontend

* React
* Vite
* TypeScript
* TailwindCSS
* Zustand
* TanStack Query

## Backend

* Hono
* Cloudflare Workers
* TypeScript

## Database

* Cloudflare D1

## File Storage

* Cloudflare R2

## Testing

* Vitest
* React Testing Library
* Playwright

---

# MONOREPO STRUCTURE

```txt id="u8vs6n"
/apps
  /web
  /api

/packages
  /shared
  /config
  /ui

/tests
  /unit
  /integration
  /e2e

/.github
```

---

# LOCAL DEVELOPMENT SETUP

# REQUIREMENTS

* Node.js LTS
* pnpm
* Wrangler CLI

---

# INSTALLATION

```bash id="x2lq4e"
pnpm install
```

---

# LOCAL ENVIRONMENT VARIABLES

## apps/web/.env.local

```env id="nglvxz"
VITE_API_BASE_URL=http://localhost:8787
```

---

## apps/api/.env.local

```env id="k8wyto"
APP_ENV=local

WORKSPACE_EXPIRE_MINUTES=1440
MAX_UPLOAD_SIZE_MB=50

R2_BUCKET=droppad-local

D1_DATABASE_ID=local-db-id
```

---

# LOCAL RUN COMMANDS

## Start frontend

```bash id="m8z1xg"
pnpm --filter web dev
```

Frontend:

* http://localhost:5173

---

## Start backend

```bash id="n3afyb"
pnpm --filter api dev
```

Backend:

* http://localhost:8787

---

# LOCAL DEVELOPMENT RULES

Local mode must:

* use local env files
* support hot reload
* not require production cloud setup
* allow mocked storage if needed

---

# DEPLOYMENT CONFIGURATION

# TARGET PLATFORM

Frontend:

* Cloudflare Pages

Backend:

* Cloudflare Workers

Storage:

* Cloudflare R2

Database:

* Cloudflare D1

---

# DEPLOY ENVIRONMENT VARIABLES

## apps/web/.env.production

```env id="rm2x3h"
VITE_API_BASE_URL=https://api.your-domain.com
```

---

## Cloudflare Worker Secrets

Set via CLI:

```bash id="hq0t4w"
wrangler secret put R2_ACCESS_KEY
wrangler secret put R2_SECRET_KEY
```

---

# WRANGLER CONFIG

## apps/api/wrangler.toml

```toml id="7zw3l5"
name = "droppad-api"
main = "src/index.ts"
compatibility_date = "2026-05-15"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "droppad"

[[d1_databases]]
binding = "DB"
database_name = "droppad-db"
database_id = "YOUR_DATABASE_ID"

[vars]
APP_ENV = "production"
WORKSPACE_EXPIRE_MINUTES = "1440"
MAX_UPLOAD_SIZE_MB = "50"
```

---

# DEPLOY COMMANDS

## Deploy frontend

```bash id="c4qfpa"
pnpm --filter web build
```

Deploy output:

* dist/

---

## Deploy backend

```bash id="rl3nq8"
pnpm --filter api deploy
```

---

# FEATURE REQUIREMENTS

# MVP FEATURES

## 1. Workspace

Users can:

* create workspace
* share workspace link
* auto expire workspace

---

## 2. Text Notes

Support:

* markdown
* autosave
* syntax highlighting

---

## 3. File Upload

Support:

* drag & drop
* clipboard paste
* multiple upload

---

## 4. Auto Expire

Configurable:

* 10 minutes
* 1 hour
* 24 hours

Expired workspaces must:

* become inaccessible
* auto cleanup

---

## 5. Download

Users can:

* preview images
* download files

---

# API CONTRACT

# CREATE WORKSPACE

POST /api/workspaces

Response:

```json id="a1g0ke"
{
  "id": "abcd1234",
  "expiresAt": "2026-05-15T12:00:00Z"
}
```

---

# GET WORKSPACE

GET /api/workspaces/:id

---

# UPLOAD FILE

POST /api/workspaces/:id/files

Content-Type:

* multipart/form-data

---

# DATABASE SCHEMA

## workspaces

```sql id="oc49q1"
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## workspace_items

```sql id="9yru4d"
CREATE TABLE workspace_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  file_key TEXT,
  created_at TEXT NOT NULL
);
```

---

# SECURITY REQUIREMENTS

Must implement:

* rate limiting
* mime validation
* signed URLs
* secure headers
* request validation

Must reject:

* executable files
* invalid mime spoofing
* oversized uploads

Forbidden:

* eval()
* unsafe HTML rendering
* exposing storage credentials

---

# FILE STORAGE RULES

Files are temporary only.

Must:

* auto cleanup expired files
* prevent public directory listing
* use signed access URLs

Must NOT:

* expose direct storage credentials

---

# CLEANUP JOB

Expired workspaces must:

* delete database records
* delete associated files
* invalidate signed URLs

Preferred implementation:

* Cloudflare Cron Trigger

---

# TEST REQUIREMENTS

# UNIT TESTS

Must cover:

* workspace creation
* expiration logic
* validation logic
* upload validation
* response schemas

---

# INTEGRATION TESTS

Must cover:

* upload flow
* download flow
* expired workspace access
* invalid workspace access

---

# E2E TESTS

Must cover:

* create workspace
* upload file
* paste text
* download file
* expiration flow

---

# SECURITY TEST SCENARIOS

Must test:

* XSS payloads
* HTML injection
* mime spoofing
* path traversal
* invalid filenames
* malicious upload attempts

---

# PERFORMANCE REQUIREMENTS

Target:

* workspace creation under 1 second
* lightweight frontend bundle
* optimized upload flow

---

# GITIGNORE TEMPLATE

```gitignore id="6vmp0g"
node_modules
dist
build
coverage

.env
.env.*
!.env.example

uploads
storage
temp
logs

.DS_Store
```

---

# CI/CD RULES

Allowed:

* lint
* test
* build

Forbidden:

* auto push git
* auto deploy production
* auto release

---

# CODING STANDARDS

* strict TypeScript
* avoid any
* reusable components
* dependency injection preferred
* single responsibility principle

---

# ERROR HANDLING

Never expose:

* stack traces
* internal paths
* secrets
* credentials

Must return:

* proper HTTP status codes
* friendly API errors

---

# LOGGING RULES

Must log:

* upload failures
* cleanup jobs
* API failures

Must NOT log:

* secrets
* tokens
* file content

---

# MVP SUCCESS CRITERIA

MVP is complete when:

* workspace creation works
* notes work
* upload works
* expiration works
* cleanup works
* tests pass
* secrets are protected

---

# FUTURE FEATURES

* realtime collaboration
* QR code sharing
* E2E encryption
* CLI uploader
* VSCode extension
* mobile PWA
* password protected workspace

---

# NON GOALS

Do NOT turn this into:

* Google Drive clone
* Dropbox clone
* Slack clone
* permanent storage platform

Keep it:

* lightweight
* fast
* temporary
* focused
