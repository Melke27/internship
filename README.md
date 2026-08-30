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

## Portals and roles

| Role | Focus |
|------|--------|
| District Administrator | District portal: manage branches, ATMs and users; review audit and reports |
| Operations Officer | District portal: monitor ATMs, create incidents and review branch reports |
| Maintenance Supervisor | Maintenance portal: assign work, verify restorations and close incidents |
| Technician | Maintenance portal: investigate, troubleshoot, resolve, escalate and complete maintenance |
| Branch Manager / Branch User | Branch portal: view branch ATMs and submit fault reports |
| Auditor | Reports, history, audit logs |

The API also accepts the legacy Administrator, Supervisor and Monitoring Officer roles so existing accounts continue to work. They are normalized to the corresponding current role.

## Three portal accounts for local testing

After running migrations, create one account for each dashboard with a strong temporary password:

```bash
cd backend
python manage.py create_portal_accounts --password 'Choose-a-strong-temporary-password'
```

The command creates a Yeka District demo branch when needed and leaves existing users unchanged.

| Login (username or email) | Dashboard | What to test |
|------|-----------|--------------|
| `district.admin` / `district.admin@example.test` | District Operations | Create branches, ATMs, and users; review incidents and reports. |
| `maintenance.tech` / `maintenance.tech@example.test` | Maintenance Operations | View assigned jobs, log troubleshooting, resolve or escalate incidents. |
| `branch.user` / `branch.user@example.test` | Branch Operations | Check branch ATMs and report an ATM fault. |

All three accounts use the password supplied to the command. Change it before any real deployment.

### Operational flow

1. The branch user reports an ATM fault.
2. The district administrator or operations officer reviews the report and creates or assigns the incident.
3. The maintenance technician investigates, records technical actions, then resolves or escalates it.
4. A district supervisor/administrator verifies the restoration and closes the incident.

## Core workflow

Login → Dashboard → View ATM status → Create/open incident → Acknowledge → Assign → Investigate → Troubleshoot (record actions) → Retest → Resolve → Verify → Close (or escalate if unresolved)

## Important rules

- Dashboard KPIs come from `/api/reports/dashboard/` (never hardcoded)
- Duplicate active incidents for the same ATM are blocked
- Incidents cannot be closed without verification and a final result
- ATM status changes are logged in status history and audit
- Backend enforces permissions; frontend only hides unavailable actions
