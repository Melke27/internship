# Full-Stack Integration Plan

Status: refreshed after full repository inspection (Phase 1). This document reflects the
**actual** state of the codebase, not the intended state.

## 1. Existing backend architecture

- Django 5.x + Django REST Framework, SimpleJWT, django-filter, drf-spectacular,
  django-cors-headers, psycopg (PostgreSQL) with a SQLite dev fallback (`USE_SQLITE=true`).
- Project layout: `config/` (settings/urls) + `apps/<domain>` packages:
  `accounts`, `organization`, `assets`, `incidents`, `notifications`, `audit`, `reports`,
  plus `apps/common` (shared scoping mixin).
- `AUTH_USER_MODEL = accounts.User` (AbstractUser + `full_name`, `phone`, `role`,
  `district` FK, `branch` FK).
- Role choices on `User.role`: `SUPER_ADMIN`, `HEAD_OFFICE`, `DISTRICT`, `TECHNICIAN`,
  `BRANCH_MANAGER`, `AUDITOR`, `REPORT_VIEWER` (7 roles; the master spec lists 12 —
  the extra roles map onto these choices plus scope, see §7).

### Models

| App | Models |
|---|---|
| organization | `District` (code unique, ACTIVE/INACTIVE), `Branch` (FK district, unique code per district, SETUP/ACTIVE/CLOSED/INACTIVE) |
| assets | `ATM` (unique `reference`, FK branch, statuses OPERATIONAL/AVAILABLE/OFFLINE/FAULT/MAINTENANCE/UNAVAILABLE/DECOMMISSIONED) |
| incidents | `Incident` (FK atm, category, priority LOW/MEDIUM/HIGH/CRITICAL, status REPORTED→ACKNOWLEDGED→ASSIGNED→INVESTIGATING→TROUBLESHOOTING→ESCALATED→RESOLVED→VERIFICATION→CLOSED, computed `incident_id`), `TroubleshootingAction`, `Escalation`, `Resolution` (1:1 incident), `Verification` (1:1 resolution, 4 check booleans) |
| audit | `AuditLog` (actor, action, entity, entity_id, previous/new value JSON) |
| notifications | **empty app — no models/endpoints yet** |

## 2. Existing API endpoints (source of truth)

Auth:
- `POST /api/auth/token/` — JWT obtain, accepts username **or** email
- `POST /api/auth/token/refresh/`
- `GET  /api/auth/me/` — current user
- **No logout/blacklist endpoint yet**

Resources (full CRUD except where noted):
- `/api/districts/`, `/api/branches/`, `/api/atms/`, `/api/incidents/`
- `/api/users/` (admin-only via `IsAdminUser`), `/api/audit-logs/` (read-only)

Incident workflow actions (all transactional + audited in `IncidentViewSet`):
- `POST /api/incidents/{id}/assign/` (`assigned_to`)
- `POST /api/incidents/{id}/status/` — validated state machine
- `GET|POST /api/incidents/{id}/troubleshooting/`
- `POST /api/incidents/{id}/escalate/`
- `POST /api/incidents/{id}/resolve/`
- `POST /api/incidents/{id}/verify/` — all 4 checks true ⇒ CLOSED else VERIFICATION

Reports:
- `GET /api/reports/dashboard/` — scoped aggregate: district/branch counts, ATM status
  breakdown, open/critical/escalated incidents, incidents by priority

Docs: `/api/schema/`, `/api/docs/`.

## 3. Authorization & scope flow

- Global DRF default: `IsAuthenticated`; `UserViewSet` uses `IsAdminUser`.
- `apps/common/permissions.py::ScopedQuerysetMixin` enforces organizational scope per
  viewset (`scope_queryset`): staff or users without district ⇒ everything;
  district user ⇒ own district; district+branch user ⇒ own branch.
  Updates outside scope are rejected; deletes are always forbidden (deactivate instead).
- **Gap:** role is data-only. No permission classes validate *actions* by role
  (e.g. only supervisors may verify). Scope limits visibility but not mutations.

## 4. Existing frontend architecture

- React 18 + TypeScript + Vite, React Router 6, TanStack Query 5, Axios,
  react-hook-form + zod installed (not yet used), Tailwind config present but UI is
  custom CSS design tokens (no shadcn/ui).
- Implemented pages: `LoginPage` (JWT login, branded), `DashboardPage` (live data),
  generic `ResourcePage` for districts/branches/atms/incidents, `IncidentDetailPage`
  with workflow mutations wired to the real endpoints.
- Services: `lib/api.ts` (axios instance, Bearer token from localStorage, 401 redirect),
  `services/resources.ts`, `services/dashboard.ts`, `services/incidentWorkflow.ts`.

## 5. Frontend/API mismatches and violations found

1. Sidebar shows hardcoded badge counts (`14`, `4`) — violates "no fake statistics".
2. Dashboard header hardcodes today's date string and "CBE Head Office · All districts"
   regardless of the signed-in user's actual scope.
3. Dashboard computes stats client-side from full list fetches instead of using
   `/api/reports/dashboard/` aggregates (summary query is fetched but unused).
4. `LoginPage.dashboardForRole` routes to non-existent paths
   (`/district/dashboard`, `/technician/dashboard`, …) and checks role values that do
   not exist in the backend's `Role.TextChoices`.
5. Auth state is read directly from localStorage in components; no central provider.
6. Sidebar links to routes that render a placeholder or nothing
   (/organization, /monitoring, /troubleshooting, /escalations, /reports, /analytics,
   /users, /audit, /settings).
7. No notification center (backend has no notifications either).
8. No logout button wired to token cleanup beyond the 401 interceptor.

## 6. Authentication flow (target = current backend contract)

1. `POST /api/auth/token/ {username|email, password}` → `{access, refresh}`.
2. Access token stored as `cbe_access_token`, refresh as `cbe_refresh_token`.
3. Axios request interceptor attaches `Authorization: Bearer <access>`.
4. Response interceptor: on 401 → clear tokens → redirect `/login`.
5. `GET /api/auth/me/` returns the serialized user (role, district, branch).
6. Add: `POST /api/auth/logout/` blacklisting the refresh token (simplejwt blacklist app)
   plus client-side token removal.

## 7. Role mapping (spec ⇢ backend)

| Spec role | Backend representation |
|---|---|
| Super Administrator | `SUPER_ADMIN` (+ is_staff) |
| Head Office Administrator | `HEAD_OFFICE`, no district |
| Central ICT Administrator | `HEAD_OFFICE` (technical dashboards) |
| District Administrator | `DISTRICT` + district FK |
| District ICT Supervisor | `DISTRICT` + district FK (supervisor capabilities) |
| District Technician / ATM Technician | `TECHNICIAN` + district FK |
| Branch Manager | `BRANCH_MANAGER` + branch FK |
| Branch ICT Officer | `BRANCH_MANAGER` + branch FK (ICT capabilities) |
| Auditor | `AUDITOR` |
| Report Viewer | `REPORT_VIEWER` |
| Intern | `REPORT_VIEWER` with explicitly granted minimal rights |

## 8. Missing features to implement (no duplication of existing work)

Backend:
1. Notifications module: `Notification` model (recipient, title, body, incident FK,
   read flag, timestamp), serializer, ViewSet (`/api/notifications/`, unread count),
   generation on assign / escalate / resolve / verify / critical-create.
2. Role-based permission classes (`apps/common/permissions.py`): action-level guards
   (acknowledge/assign ⇒ supervisor+; troubleshoot/escalate/resolve ⇒ technician+;
   verify/close ⇒ supervisor+) layered on top of existing scope enforcement.
3. Logout endpoint with token blacklist.
4. Audit coverage for district/branch/ATM/user create-update (currently incidents only).
5. Report endpoints: head-office/district/branch/ATM/technician aggregates built on the
   same scoped queryset helpers.

Frontend:
1. Central `AuthProvider` (currentUser, roles, permissions, scope, login/logout/refresh).
2. Permission-aware sidebar without fake counters; real unread notification badge.
3. Pages: Users, Audit logs, Escalations queue, Troubleshooting log, Reports,
   Notifications, Organization tree, ATM monitoring filters, Access-denied + 404 pages.
4. Route protection by permission (`ProtectedRoute`, `PermissionRoute`).
5. Server-side search/filter/pagination usage with debounce; loading/empty/error states.
6. Fix all hardcoded/fake data listed in §5.

## 9. Required modifications (files)

Backend: `apps/notifications/*` (new), `apps/common/permissions.py`, `config/settings.py`
(simplejwt blacklist app), `config/urls.py`, `apps/accounts/views.py` (logout, me
enrichment), `apps/organization/views.py`, `apps/assets/views.py` (audit hooks),
`apps/reports/views.py` (report endpoints), tests under `backend/tests/`.

Frontend: `src/lib/api.ts`, new `src/context/AuthContext.tsx`, `src/lib/permissions.ts`,
`src/services/*.ts` extensions, new pages under `src/pages/`, `main.tsx` routing,
`AppLayout.tsx` cleanup.

## 10. Testing plan

1. Backend: `python manage.py check`, migrations, existing pytest suite, plus new tests:
   auth (valid/invalid/me/logout), scope isolation (district A vs B, branch A1 vs A2),
   full incident lifecycle (create→…→close), notifications created at each step,
   audit rows written, permission denials per role.
2. Frontend: `npm run build` must pass with zero TS errors; no mock/dummy/fake strings
   in production screens.
3. E2E manual pass: Branch Manager reports problem → Supervisor acknowledges/assigns →
   Technician investigates/troubleshoots/(escalates)/resolves → Supervisor verifies →
   Closed; verify dashboard/report/audit/notification updates at each step.
