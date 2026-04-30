# Qualitative AI Interview Studio

Qualitative AI Interview Studio is a deployed research platform for running structured qualitative workflows across studies, protocols, personas, interview guides, transcripts, simulations, and comparative analysis.

The product is designed for researchers who want AI-assisted interviewing and analysis without losing methodological control.

## What It Does

- creates and scopes work by study
- captures protocol guidance (`shared context`, `interview style`, `consistency rules`, `analysis focus`)
- extracts personas and guides from uploaded documents (`txt`, `docx`, `pdf`)
- stores real interview transcripts for comparison
- runs persona-conditioned AI interview simulations
- generates structured comparison artifacts (tables + narrative summaries)
- produces Gioia-oriented analysis outputs
- exports simulation outputs in multiple formats
- demonstrates customer support ticket intake and AI-agent triage workflow

## Architecture

- **Backend:** FastAPI (`backend/`)
- **Frontend:** multi-page static UI served by FastAPI (`frontend/`)
- **Storage:** local JSON or Supabase via storage adapter
- **Auth:** Supabase-backed session auth with protected routes and API access control
- **Deploy:** Render (`render.yaml`)

## Auth + Security Model

- Supabase client is initialized once and shared
- credentials are loaded from environment variables only
- auth session is read from one source of truth (`/api/auth/session`)
- protected UI routes redirect unauthenticated users to `/sign-in`
- protected API routes enforce auth in middleware
- auth cookies are HttpOnly and configurable (`secure`, `samesite`)
- unsafe API requests are origin-checked to reduce CSRF risk
- security headers are applied centrally (CSP, frame blocking, nosniff, referrer policy, HSTS on HTTPS)
- auth endpoints are rate limited in-process to slow brute-force attempts
- uploads are restricted by extension/content type and capped by byte size
- Supabase/storage/auth errors are sanitized before returning to UI

## Local Development

Install:

```bash
python install.py
```

Run app:

```bash
./run.sh
```

Or run directly:

```bash
source venv/bin/activate
python -m uvicorn backend.main:app --reload
```

Open:

- `http://127.0.0.1:8000`

Support ticket agent handoff context:

- `docs/customer-support-ticket-agent-context.md`

## Required Environment Variables

- `OPENAI_API_KEY`
- `N8N_SUPPORT_TICKET_WEBHOOK_URL` (optional; when set, support tickets are triaged by n8n)
- `N8N_SUPPORT_TICKET_WEBHOOK_SECRET` (optional shared secret sent as `X-Support-Webhook-Secret`)
- `N8N_SUPPORT_TICKET_TIMEOUT_SECONDS`
- `STORAGE_BACKEND` (`local` or `supabase`)
- `LOCAL_STORAGE_ROOT`
- `SUPABASE_URL` (required when `STORAGE_BACKEND=supabase`)
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required when `STORAGE_BACKEND=supabase`)
- `CORS_ORIGINS`
- `AUTH_ACCESS_COOKIE_NAME`
- `AUTH_REFRESH_COOKIE_NAME`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAMESITE`
- `MAX_UPLOAD_BYTES`
- `ALLOWED_UPLOAD_EXTENSIONS`
- `AUTH_RATE_LIMIT_ATTEMPTS`
- `AUTH_RATE_LIMIT_WINDOW_SECONDS`

## Render Deployment

`render.yaml` is included and configured for FastAPI startup:

- build: `pip install -r requirements.txt`
- start: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

Set env vars in Render dashboard (especially Supabase keys and `CORS_ORIGINS` set to your Render app URL).

## Repository Structure

```text
backend/         # API, auth, schemas, services, storage
frontend/        # UI pages, styles, app logic
scripts/         # simulation/analysis/export workflows
utils/           # file parsing helpers
supabase/        # schema reference
```

## Notes

- Legacy prototype code remains in-repo for reference, but the deployed runtime is FastAPI + frontend pages.
- For public repos, keep secrets out of tracked files and rotate any previously exposed keys.
