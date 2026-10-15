# Greninja

Greninja is a personal-finance web application for importing MariBank
e-Statements, reviewing transaction history, and understanding cash flow. It
extracts transactions from PDF statements, assigns practical categories, and
stores the resulting records in Supabase. The dashboard visualizes the saved
data, and an AI assistant can answer questions using the signed-in user's recent
financial activity.

This repository contains two independently run/deployed applications:

- `frontend/` — React single-page application built with Vite.
- `backend/` — Flask API for authenticated uploads, PDF processing, AI chat,
  account deletion, and optional n8n automation.

## Features

- Email/password registration and sign-in, Google OAuth, password recovery,
  and account settings through Supabase Auth.
- MariBank e-Statement PDF upload, including optional PDF password entry.
- Transaction extraction, date normalization, category assignment, and
  duplicate-resistant upsert into Supabase.
- Dashboard with monthly income/expense and cash-flow summaries, category and
  merchant charts, and a running cash-flow view over imported transactions.
- Search, category/month/year filters, sorting, editing, and deletion in the
  transaction table.
- Responsive navigation and a light/dark color scheme.
- Groq-powered financial chat. The backend supplies the model with the user's
  last 30 days of income/expense totals and up to ten recent transaction
  descriptions.
- Optional n8n endpoints for monthly summary/reminder workflows and allow-listed
  automated statement uploads.
- Account deletion that removes the user's transaction records and Supabase
  Auth account.

Only MariBank e-Statements are currently supported by the PDF parser. The
dashboard and automation summarize records already stored in Supabase; an
uploaded PDF is parsed in memory rather than saved as a file.

### Statement processing

The parser reads the statement period and transaction columns from the PDF,
normalizes dates to ISO format, and calculates each row's signed amount as
`incoming - outgoing` (income is positive; money out is negative). Category
labels are assigned using description keywords, including `Interest`,
`Reward`, `Fees`, `Load/Data`, `Card Payment`, `QR/InstaPay`, `Self Transfer`,
`Transfer (Other Party)`, and `Uncategorized`. Self-transfer classification
also compares the account holder's name tokens with the transfer description.

Each row receives a SHA-256 `transaction_hash` based on its user, date, amount,
description, and same-row occurrence number. The backend upserts using that
hash as the conflict key, so the database must enforce its uniqueness.
`Self Transfer` and `Load/Data` are excluded from income/expense totals used by
the chat and monthly summaries; the dashboard also excludes them from expense
breakdowns.

## Architecture and data flow

```text
Browser (React/Vite)
  ├─ Supabase Auth: sign-in, OAuth, password and profile metadata
  ├─ Supabase Database: user-scoped transaction reads/edits/deletes
  └─ Flask API: bearer-token authenticated upload, chat and account deletion
       ├─ Supabase Auth API: verify the caller and manage accounts
       ├─ Supabase Database: upsert and query transactions
       ├─ pdfplumber + pandas: extract and normalize PDF rows
       ├─ Groq: answer finance questions using recent transaction context
       └─ (optional) n8n: receive upload totals / request summaries or uploads
```

The frontend sends the signed-in Supabase access token to protected Flask
endpoints. The API verifies it with Supabase and uses the verified user ID,
not a user ID supplied by the browser. The frontend also accesses the
`transactions` table directly for dashboard and transaction-management
operations, so database Row Level Security (RLS) is essential.

### Main modules

| Path | Responsibility |
| --- | --- |
| `backend/app.py` | Flask app, authentication, PDF parsing/categorization, API routes, Groq and n8n integrations |
| `backend/requirements.txt` | Python runtime dependencies |
| `backend/.env.example` | Backend environment-variable template with placeholders only |
| `frontend/src/App.jsx` | Supabase session lifecycle, OAuth callback/recovery handling, navigation and app shell |
| `frontend/src/Auth.jsx`, `ResetPassword.jsx`, `Settings.jsx` | Authentication, password recovery and account settings |
| `frontend/src/UploadStatement.jsx` | PDF upload form |
| `frontend/src/Dashboard.jsx` | Dashboard queries, calculations and charts |
| `frontend/src/TransactionTable.jsx` | Transaction list, filtering, editing and deletion |
| `frontend/src/Chatbot.jsx` | Chat interface |
| `frontend/src/api.js` | Authenticated requests to the Flask API |
| `frontend/src/supabaseClient.js` | Supabase browser client configuration |
| `frontend/.env.example` | Frontend environment-variable template |
| `frontend/vercel.json` | OAuth callback rewrite for the single-page app |
| `frontend/vite.config.js` | Vite/React build configuration and chart/UI code splitting |

## Technologies

### Frontend

- React 19 and React DOM
- Vite 8 with the React plugin
- Supabase JavaScript client
- Mantine components and hooks
- ECharts with `echarts-for-react`
- Tabler icons
- Browser `fetch` is used for requests to the Flask API; primary navigation is
  managed in the app shell.

### Backend

- Python and Flask, with Flask-CORS
- Supabase Python client
- `pdfplumber` and pandas for statement extraction and normalization
- Groq Python client for the AI assistant
- `httpx` for the optional n8n upload notification
- `python-dotenv` for loading the backend `.env` file
- Gunicorn, included for WSGI deployment

Frontend dependency versions are declared in `frontend/package.json` and
resolved by `frontend/package-lock.json`. Python dependencies are listed
without version pins in `backend/requirements.txt`; use a virtual environment
and consider pinning versions for reproducible deployments.

Frontend development dependencies include ESLint, Prettier, Vite's React
plugin, and the React Hooks/Refresh ESLint plugins.

## Requirements

- Node.js compatible with Vite 8 (use a current Node.js LTS release) and npm.
- A recent Python 3 release; the supplied local virtual environment uses
  Python 3.13. The backend requirements do not declare a minimum version.
- A Supabase project with Auth and a `public.transactions` table.
- A Groq API key and model ID for the AI assistant.
- Optional: a configured n8n instance/workflow for automated summaries,
  reminders, or file-watcher uploads.

## Supabase setup

The frontend uses Supabase Auth and queries the `transactions` table directly.
There is no database migration in this repository. The following schema and
policies match the fields and operations used by the current code; apply them
in the Supabase SQL editor if the project does not already have an equivalent
table and RLS policies:

```sql
create table if not exists public.transactions (
  transaction_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  description text not null,
  category text not null,
  amount numeric not null,
  outgoing numeric not null default 0,
  incoming numeric not null default 0
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date);

alter table public.transactions enable row level security;

create policy "Users can read their transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can update their transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);
```

The backend writes with the Supabase service-role key, which bypasses RLS.
Keep that key only in the backend environment; never put it in frontend code
or a `VITE_*` variable. The browser should use only the project's public
publishable/anon key. Confirm that existing policies, triggers, and constraints
are compatible before applying this example to an existing database.

Enable the desired sign-in methods (email/password and, if used, Google) in
Supabase Authentication. For Google OAuth, the provider's authorized redirect
URI is the Supabase project's provider callback URL. Add each local and
production frontend origin/callback to Supabase's allowed redirect URLs.

## Configuration

### Backend environment

Copy `backend/.env.example` to `backend/.env` for local development. The
backend loads it when started from the `backend/` directory. Do not commit the
file; the repository `.gitignore` excludes environment files.

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_KEY` | Yes | Supabase **service-role** secret; required for server-side database access and Auth Admin operations. Keep private. |
| `GROQ_API_KEY` | Yes | Groq API key. The backend initializes the Groq client at startup. |
| `GROQ_MODEL` | Yes for AI chat | Primary model ID available to the Groq account. |
| `GROQ_FALLBACK_MODEL` | No | Optional second model used after retryable errors from the primary model. |
| `ALLOWED_ORIGINS` | No | Comma-separated browser origins allowed by Flask-CORS. Defaults to `http://localhost:5173`; set the deployed frontend origin in production. |
| `N8N_SECRET` | No | Shared secret checked in the `X-Internal-Secret` header by internal automation endpoints. Leave unset to keep those endpoints unauthorized. |
| `N8N_UPLOAD_WEBHOOK_URL` | No | n8n upload-alert webhook. When configured, the backend asynchronously sends upload totals, not merchant descriptions. |
| `AUTO_UPLOAD_EMAILS` | No | Comma-separated email allow-list for `/api/internal/upload`. Automatic uploads are disabled when empty. |

### Frontend environment

Copy `frontend/.env.example` to `frontend/.env.local` and set the values for
your project.

`VITE_API_URL` is the Flask API base URL without a trailing slash. If unset,
the frontend currently uses `https://greninja-ovg9.onrender.com`.

The frontend reads the Supabase project URL and public anon key from
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is designed for
browser use; secure the database with RLS. Never put a service-role key in the
frontend or in any `VITE_*` variable.

For production Google OAuth, set `VITE_PUBLIC_SITE_URL` to the public HTTPS
frontend origin at build time. The existing production setup uses
`https://greninja-app.vercel.app`. The Vercel rewrite in `frontend/vercel.json`
routes `/auth/callback` to the SPA entry point. After changing the callback
rewrite or frontend environment variables, rebuild/redeploy and update the
Supabase allowed redirect URLs. The backend's `ALLOWED_ORIGINS` must include
the exact frontend origin.

## Local installation and setup

### 1. Configure Supabase

Create or select a Supabase project, enable the required Auth providers, create
the `transactions` table with user-scoped RLS, and configure the Auth redirect
URLs.

### 2. Configure environment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to
`frontend/.env.local`. Fill in the Supabase project URL in both files; use the
public anon key only in the frontend and the private service-role key only in
the backend. Add Groq credentials and a current model ID to `backend/.env`.

### 3. Start the backend

From PowerShell:

```powershell
Set-Location backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

```powershell
python app.py
```

The development server listens on `http://127.0.0.1:5000`. For deployment,
run the WSGI application with Gunicorn (for example, with `backend/` as the
working directory and `gunicorn app:app` as the start command); do not use
Flask's debug development server in production.

### 4. Start the frontend

In a second terminal:

```powershell
Set-Location frontend
npm ci
```

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite is configured to listen on all interfaces
at port 5173. If using another device on the local network, add that exact
origin to Supabase's allowed URLs and the backend's `ALLOWED_ORIGINS`, and
allow the port through the host firewall. Use the production HTTPS site URL
for `VITE_PUBLIC_SITE_URL`; it is not needed for local Google sign-in.

## API reference

All API paths are relative to the Flask server origin. The three user-facing
routes require `Authorization: Bearer <Supabase access token>`.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/upload` | Supabase bearer token | Multipart form fields: `file` (PDF) and optional `password`. Parses and categorizes a MariBank statement, then upserts transactions for the verified user. |
| `POST /api/delete-account` | Supabase bearer token | Deletes the caller's transactions and Auth account. This operation is permanent. |
| `POST /api/chat` | Supabase bearer token | JSON body: `{"message":"..."}`. Responds with `{"response":"..."}`. |
| `GET /api/internal/monthly-summaries` | `X-Internal-Secret` | Returns monthly totals for n8n. Optional query parameters: `month=YYYY-MM`, `include_inactive=true`, and `email=user@example.com`. Defaults to the previous calendar month. |
| `POST /api/internal/upload` | `X-Internal-Secret` plus email allow-list | Multipart `file`, `email`, and optional `password`. Accepts PDF files up to 15 MiB. Intended for the n8n file-watcher workflow. |

The upload endpoint reports an error for PDFs from which no transaction rows
can be extracted. Internal endpoints return `401` when the shared secret is
missing or invalid; automated upload also rejects emails not listed in
`AUTO_UPLOAD_EMAILS`.

## n8n integration

The optional integration supports an upload-alert webhook and monthly
summaries/reminders. Set the same `N8N_SECRET` in the backend and n8n, and send
it as `X-Internal-Secret` for internal endpoint requests. Configure
`N8N_UPLOAD_WEBHOOK_URL` to enable upload notifications. Those notifications
contain the account email and aggregate totals/date range/category summary, not
transaction descriptions or merchant names.

For automatic uploads, also configure `AUTO_UPLOAD_EMAILS` with only authorized
accounts. The backend checks both the shared secret and the email allow-list.
Keep n8n credentials and webhook URLs private. This public showcase excludes
the former local test helper, which contained a real shared secret and account
email. Rotate any provider credential if it has ever been published or shared
outside trusted local configuration.

## Development checks

Run from `frontend/`:

```powershell
npm run lint
npm run build
```

No automated backend test suite is currently included.

## Deployment notes

- Deploy the frontend from `frontend/` using `npm run build` and serve the
  generated `dist/` directory. Vercel's SPA rewrite for `/auth/callback` is
  already configured.
- Deploy the backend from `backend/`, install `requirements.txt`, provide the
  backend environment variables in the hosting provider, and use
  `gunicorn app:app` as the WSGI start command.
- Set `VITE_API_URL` and `VITE_PUBLIC_SITE_URL` in the frontend build
  environment, and set `ALLOWED_ORIGINS` in the backend runtime environment.
- Keep the Supabase service-role key, Groq key, n8n secret, and webhook
  configuration on the backend only. Browser `VITE_*` values are included in
  the built application and must not contain server secrets.
- The frontend currently reads and manages transaction rows directly through
  Supabase, so production RLS must restrict each authenticated user to their
  own rows.
- The source repositories' local `.env` and the former n8n test helper are not
  included in this standalone showcase. Review provider dashboards and rotate
  any credential that may have been exposed elsewhere.
