# ATM District Technical Support & Monitoring

Single-district ATM technical operations system: monitor ATM health, manage incidents, record troubleshooting, escalate, verify restorations, schedule maintenance, and audit activity.

One dashboard (`/dashboard`). Role-based permissions. No banking/customer financial features.

## Stack

- **Backend:** Django 5 + DRF + SimpleJWT
- **Frontend:** React 18 + TypeScript + Vite + TanStack Query + Tailwind-ready CSS

## Run locally

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements/base.txt
cp .env.example .env   # if needed
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API: `http://localhost:8000/api`  
Docs: `http://localhost:8000/api/docs/`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`  
Proxy: `/api` → Django (`VITE_DJANGO_PROXY`, default `http://localhost:8000`)

## Roles

| Role | Focus |
|------|--------|
| Administrator | Users, ATMs/branches, full access, audit |
| Supervisor | Assign, verify, close, escalations, reports |
| Technician | Investigate, troubleshoot, resolve, escalate, maintenance |
| Monitoring Officer | Monitor ATMs, create incidents |
| Auditor | Reports, history, audit logs |

## Core workflow

Login → Dashboard → View ATM status → Create/open incident → Acknowledge → Assign → Investigate → Troubleshoot (record actions) → Retest → Resolve → Verify → Close (or escalate if unresolved)

## Important rules

- Dashboard KPIs come from `/api/reports/dashboard/` (never hardcoded)
- Duplicate active incidents for the same ATM are blocked
- Incidents cannot be closed without verification and a final result
- ATM status changes are logged in status history and audit
- Backend enforces permissions; frontend only hides unavailable actions
