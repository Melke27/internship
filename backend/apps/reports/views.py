from datetime import timedelta

from django.db.models import Avg, Count, DurationField, F, Prefetch, Q
from django.db.models.functions import Cast, TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organization.yeka import YEKA_NAME, get_yeka_district
from apps.accounts.models import User
from apps.assets.models import ATM, ATMStatusHistory, Maintenance
from apps.incidents.models import BranchReport, Incident, TroubleshootingAction
from apps.organization.models import Branch, District

def scoped(user):
    districts = District.objects.all()
    branches = Branch.objects.all()
    atms = ATM.objects.select_related("branch", "branch__district")
    incidents = Incident.objects.select_related("atm", "atm__branch", "assigned_to")
    reports = BranchReport.objects.select_related("atm", "branch", "reported_by")
    if not user.is_staff and user.district_id:
        districts = districts.filter(id=user.district_id)
        branches = branches.filter(district_id=user.district_id)
        atms = atms.filter(branch__district_id=user.district_id)
        incidents = incidents.filter(atm__branch__district_id=user.district_id)
        reports = reports.filter(branch__district_id=user.district_id)
        if user.branch_id:
            branches = branches.filter(id=user.branch_id)
            atms = atms.filter(branch_id=user.branch_id)
            incidents = incidents.filter(atm__branch_id=user.branch_id)
            reports = reports.filter(branch_id=user.branch_id)
    return districts, branches, atms, incidents, reports


def build_trend(qs_map, days=14):
    """Return the last N days with per-day counts for each series.

    qs_map maps a series key to a tuple ``(queryset, date_field)``.
    """
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    buckets = {
        start + timedelta(days=i): {"date": str(start + timedelta(days=i)), "label": (start + timedelta(days=i)).strftime("%b %d")}
        for i in range(days)
    }
    for key, (qs, date_field) in qs_map.items():
        rows = (
            qs.annotate(day=TruncDate(date_field))
            .filter(day__gte=start)
            .values("day")
            .annotate(total=Count("id"))
        )
        counts = {row["day"]: row["total"] for row in rows}
        for day, meta in buckets.items():
            meta[key] = counts.get(day, 0)
    return list(buckets.values())


class DashboardSummaryView(APIView):
    def get(self, request):
        user = request.user
        districts, branches, atms, incidents, reports = scoped(user)
        open_incidents = incidents.exclude(status=Incident.Status.CLOSED)
        today = timezone.now().date()
        district = get_yeka_district()
        maintenance_qs = Maintenance.objects.filter(atm__in=atms)
        active_maintenance = maintenance_qs.exclude(
            status__in=[Maintenance.Status.VERIFIED, Maintenance.Status.CANCELLED, Maintenance.Status.COMPLETED]
        )
        pending_reports = reports.filter(
            status__in=[
                BranchReport.Status.SUBMITTED,
                BranchReport.Status.RECEIVED,
                BranchReport.Status.REVIEWING,
            ]
        )

        open_incidents_prefetch = Prefetch(
            "incidents",
            queryset=Incident.objects.exclude(status=Incident.Status.CLOSED).select_related("assigned_to").order_by("-created_at"),
            to_attr="open_incidents_list",
        )

        critical_atms = atms.filter(status=ATM.Status.CRITICAL, is_active=True).prefetch_related(open_incidents_prefetch)
        fault_atms = atms.filter(
            status__in=[ATM.Status.FAULT, ATM.Status.CRITICAL, ATM.Status.OFFLINE, ATM.Status.DEGRADED, ATM.Status.WARNING],
            is_active=True,
        ).prefetch_related(open_incidents_prefetch)

        attention_rows = []
        for atm in critical_atms.order_by("last_status_change", "reference")[:12]:
            active_list = getattr(atm, "open_incidents_list", [])
            active = active_list[0] if active_list else None
            duration_minutes = None
            if atm.last_status_change:
                duration_minutes = int((timezone.now() - atm.last_status_change).total_seconds() // 60)
            attention_rows.append(
                {
                    "id": atm.id,
                    "reference": atm.reference,
                    "name": atm.name,
                    "status": atm.status,
                    "health": atm.health,
                    "is_active": atm.is_active,
                    "operational_state": atm.operational_state,
                    "branch": atm.branch.name,
                    "problem": active.title if active else atm.status.replace("_", " ").title(),
                    "network_status": atm.network_status,
                    "hardware_status": atm.hardware_status,
                    "last_checked": atm.last_checked,
                    "duration_minutes": duration_minutes,
                    "assigned": active.assigned_to.full_name if active and active.assigned_to else (
                        atm.assigned_technician.full_name if atm.assigned_technician else None
                    ),
                    "active_incident": active.incident_id if active else None,
                    "active_incident_id": active.id if active else None,
                    "priority": active.priority if active else None,
                }
            )

        active_faults = []
        for atm in fault_atms.order_by("-last_status_change")[:20]:
            active_list = getattr(atm, "open_incidents_list", [])
            active = active_list[0] if active_list else None
            duration_minutes = None
            if atm.last_status_change:
                duration_minutes = int((timezone.now() - atm.last_status_change).total_seconds() // 60)
            active_faults.append(
                {
                    "id": atm.id,
                    "reference": atm.reference,
                    "branch": atm.branch.name,
                    "fault": active.category if active else atm.status,
                    "priority": active.priority if active else "MEDIUM",
                    "status": active.status if active else atm.status,
                    "reported": active.created_at if active else atm.last_status_change,
                    "assigned": active.assigned_to.full_name if active and active.assigned_to else None,
                    "duration_minutes": duration_minutes,
                    "active_incident_id": active.id if active else None,
                    "active_incident": active.incident_id if active else None,
                }
            )

        recent_incidents = open_incidents.order_by("-created_at")[:8]
        recent_actions = TroubleshootingAction.objects.filter(incident__in=incidents).select_related(
            "incident", "technician", "incident__atm"
        ).order_by("-created_at")[:8]
        recent_status_changes = ATMStatusHistory.objects.filter(atm__in=atms).select_related("atm", "changed_by").order_by(
            "-created_at"
        )[:8]
        recent_branch_reports = reports.select_related("atm", "branch").prefetch_related("incident").order_by("-created_at")[:8]
        technicians = User.objects.filter(assigned_incidents__in=open_incidents).distinct()

        return Response(
            {
                "scope": {"district": user.district_id, "branch": user.branch_id},
                "district_name": YEKA_NAME,
                "last_updated": timezone.now(),
                "districts": 1,
                "branches": branches.count(),
                "branch_summary_list": [
                    {
                        "id": b.id,
                        "name": b.name,
                        "code": b.code,
                        "status": b.status,
                        "total_atms": b.atms.count(),
                        "operational": b.atms.filter(status=ATM.Status.OPERATIONAL, is_active=True).count(),
                        "faults": b.atms.filter(status__in=[ATM.Status.FAULT, ATM.Status.WARNING, ATM.Status.DEGRADED, ATM.Status.CRITICAL, ATM.Status.OFFLINE], is_active=True).count(),
                    }
                    for b in branches.order_by("name")
                ],
                "atms": atms.count(),
                "total_atms": atms.count(),
                "active_atms": atms.filter(is_active=True).count(),
                "inactive_atms": atms.filter(is_active=False).count(),
                "critical_atms": critical_atms.count(),
                "open_incidents": open_incidents.count(),
                "pending_branch_reports": pending_reports.count(),
                "maintenance_count": active_maintenance.count(),
                "under_repair": atms.filter(status=ATM.Status.UNDER_REPAIR).count(),
                "atm_status": {status: atms.filter(status=status).count() for status, _ in ATM.Status.choices},
                "atm_health": {status: atms.filter(health=status).count() for status, _ in ATM.Health.choices},
                "critical_incidents": open_incidents.filter(priority=Incident.Priority.CRITICAL).count(),
                "escalated_incidents": open_incidents.filter(status=Incident.Status.ESCALATED).count(),
                "resolved_today": incidents.filter(resolved_at__date=today).count(),
                "incidents_by_priority": dict(
                    open_incidents.values("priority").annotate(total=Count("id")).values_list("priority", "total")
                ),
                "attention_atms": attention_rows,
                "active_faults": active_faults,
                "active_fault_total": fault_atms.count(),
                "recent_branch_reports": [
                    {
                        "id": report.id,
                        "report_id": report.report_id,
                        "atm_reference": report.atm.reference,
                        "branch": report.branch.name,
                        "problem_type": report.problem_type,
                        "severity": report.severity,
                        "status": report.status,
                        "created_at": report.created_at,
                        "linked_incident": report.incident.incident_id if hasattr(report, "incident") and report.incident_id else None,
                    }
                    for report in recent_branch_reports
                ],
                "recent_incidents": [
                    {
                        "id": incident.id,
                        "incident_id": incident.incident_id,
                        "title": incident.title,
                        "status": incident.status,
                        "priority": incident.priority,
                        "atm_reference": incident.atm.reference,
                        "assigned_to_name": incident.assigned_to.full_name if incident.assigned_to else None,
                        "created_at": incident.created_at,
                    }
                    for incident in recent_incidents
                ],
                "recent_actions": [
                    {
                        "id": action.id,
                        "action": action.action,
                        "result": action.result,
                        "technician": action.technician.full_name or action.technician.username,
                        "incident_id": action.incident.incident_id,
                        "atm": action.incident.atm.reference,
                        "created_at": action.created_at,
                    }
                    for action in recent_actions
                ],
                "recent_status_changes": [
                    {
                        "id": row.id,
                        "atm_reference": row.atm.reference,
                        "old_status": row.old_status,
                        "new_status": row.new_status,
                        "reason": row.reason,
                        "changed_by_name": row.changed_by.full_name if row.changed_by else None,
                        "created_at": row.created_at,
                    }
                    for row in recent_status_changes
                ],
                "technician_workload": [
                    {
                        "id": tech.id,
                        "name": tech.full_name or tech.username,
                        "assigned_incidents": open_incidents.filter(assigned_to=tech).count(),
                        "critical_incidents": open_incidents.filter(
                            assigned_to=tech, priority=Incident.Priority.CRITICAL
                        ).count(),
                    }
                    for tech in technicians
                ],
"maintenance_kpis": {
                "total": maintenance_qs.count(),
                "pending": maintenance_qs.filter(
                    status__in=[Maintenance.Status.REQUESTED, Maintenance.Status.APPROVED]
                ).count(),
                "assigned": maintenance_qs.filter(status=Maintenance.Status.ASSIGNED).count(),
                "in_progress": maintenance_qs.filter(status=Maintenance.Status.IN_PROGRESS).count(),
                "under_repair": maintenance_qs.filter(status=Maintenance.Status.UNDER_REPAIR).count(),
                "testing": maintenance_qs.filter(status=Maintenance.Status.TESTING).count(),
                "completed": maintenance_qs.filter(
                    status__in=[Maintenance.Status.COMPLETED, Maintenance.Status.VERIFIED]
                ).count(),
                "overdue": maintenance_qs.filter(
                    scheduled_date__lt=timezone.now(),
                    status__in=[
                        Maintenance.Status.SCHEDULED,
                        Maintenance.Status.ASSIGNED,
                        Maintenance.Status.IN_PROGRESS,
                        Maintenance.Status.UNDER_REPAIR,
                    ],
                ).count(),
                "emergency": maintenance_qs.filter(maintenance_type=Maintenance.MaintenanceType.EMERGENCY)
                .exclude(status__in=[Maintenance.Status.VERIFIED, Maintenance.Status.CANCELLED])
                .count(),
            },
            "trends": {
                "incidents": build_trend(
                    {
                        "created": (incidents, "created_at"),
                        "resolved": (incidents.filter(resolved_at__isnull=False), "resolved_at"),
                    }
                ),
                "maintenance": build_trend(
                    {
                        "created": (maintenance_qs, "created_at"),
                        "completed": (
                            maintenance_qs.filter(
                                status__in=[Maintenance.Status.COMPLETED, Maintenance.Status.VERIFIED]
                            ),
                            "end_date",
                        ),
                    }
                ),
                "reports": build_trend(
                    {
                        "submitted": (reports, "created_at"),
                        "converted": (reports.filter(status=BranchReport.Status.CONVERTED_TO_INCIDENT), "created_at"),
                    }
                ),
            },
        }
        )


class DistrictReportView(APIView):
    def get(self, request):
        districts, _, _, incidents, _ = scoped(request.user)
        rows = []
        for district in districts:
            district_atms = ATM.objects.filter(branch__district=district)
            district_incidents = incidents.filter(atm__branch__district=district)
            operational = district_atms.filter(status=ATM.Status.OPERATIONAL, is_active=True).count()
            rows.append(
                {
                    "district": district.name,
                    "code": district.code,
                    "branches": Branch.objects.filter(district=district).count(),
                    "atms": district_atms.count(),
                    "atm_availability": round(operational / district_atms.count() * 100) if district_atms.count() else 0,
                    "incidents": district_incidents.count(),
                    "open_incidents": district_incidents.exclude(status=Incident.Status.CLOSED).count(),
                    "escalations": district_incidents.filter(status=Incident.Status.ESCALATED).count(),
                    "resolved": district_incidents.filter(
                        status__in=[Incident.Status.RESOLVED, Incident.Status.VERIFIED, Incident.Status.CLOSED]
                    ).count(),
                }
            )
        return Response(rows)


class BranchReportView(APIView):
    """Aggregate branch performance reports (not BranchReport model list)."""

    def get(self, request):
        _, branches, _, incidents, reports = scoped(request.user)
        rows = []
        for branch in branches.select_related("district"):
            branch_incidents = incidents.filter(atm__branch=branch)
            branch_reports = reports.filter(branch=branch)
            top_categories = list(
                branch_incidents.values("category").annotate(total=Count("id")).order_by("-total")[:5]
            )
            rows.append(
                {
                    "branch": branch.name,
                    "district": branch.district.name,
                    "code": branch.code,
                    "atms": ATM.objects.filter(branch=branch).count(),
                    "atm_status": {
                        status: ATM.objects.filter(branch=branch, status=status).count()
                        for status, _ in ATM.Status.choices
                    },
                    "incidents": branch_incidents.count(),
                    "reports_submitted": branch_reports.count(),
                    "reports_converted": branch_reports.filter(
                        status=BranchReport.Status.CONVERTED_TO_INCIDENT
                    ).count(),
                    "open_reports": branch_reports.exclude(
                        status__in=[
                            BranchReport.Status.CLOSED,
                            BranchReport.Status.DISMISSED,
                            BranchReport.Status.RESOLVED,
                            BranchReport.Status.VERIFIED,
                        ]
                    ).count(),
                    "common_categories": [
                        {"category": c["category"] or "Uncategorised", "count": c["total"]} for c in top_categories
                    ],
                    "resolved": branch_incidents.filter(
                        status__in=[Incident.Status.RESOLVED, Incident.Status.VERIFIED, Incident.Status.CLOSED]
                    ).count(),
                }
            )
        return Response(rows)


class TechnicianReportView(APIView):
    def get(self, request):
        _, _, _, incidents, _ = scoped(request.user)
        technicians = User.objects.filter(assigned_incidents__isnull=False).distinct()
        if request.user.district_id:
            technicians = technicians.filter(district_id=request.user.district_id)
        rows = []
        resolved_duration = Cast(F("resolved_at") - F("created_at"), output_field=DurationField())
        for tech in technicians:
            assigned = incidents.filter(assigned_to=tech)
            resolved = assigned.filter(resolved_at__isnull=False)
            avg_seconds = resolved.aggregate(avg=Avg(resolved_duration))["avg"]
            rows.append(
                {
                    "technician": tech.full_name or tech.username,
                    "assigned": assigned.count(),
                    "pending": assigned.exclude(
                        status__in=[Incident.Status.VERIFIED, Incident.Status.CLOSED]
                    ).count(),
                    "resolved": resolved.count(),
                    "escalations": assigned.filter(status=Incident.Status.ESCALATED).count(),
                    "avg_resolution_hours": round(avg_seconds.total_seconds() / 3600, 1) if avg_seconds else None,
                }
            )
        return Response(rows)


class MaintenanceReportView(APIView):
    def get(self, request):
        _, _, atms, _, _ = scoped(request.user)
        qs = Maintenance.objects.filter(atm__in=atms)
        completed = qs.filter(status__in=[Maintenance.Status.COMPLETED, Maintenance.Status.VERIFIED])
        return Response(
            {
                "total_jobs": qs.count(),
                "completed": completed.count(),
                "pending": qs.filter(
                    status__in=[Maintenance.Status.REQUESTED, Maintenance.Status.APPROVED, Maintenance.Status.SCHEDULED]
                ).count(),
                "overdue": qs.filter(
                    scheduled_date__lt=timezone.now(),
                    status__in=[
                        Maintenance.Status.SCHEDULED,
                        Maintenance.Status.ASSIGNED,
                        Maintenance.Status.IN_PROGRESS,
                        Maintenance.Status.UNDER_REPAIR,
                    ],
                ).count(),
                "emergency": qs.filter(maintenance_type=Maintenance.MaintenanceType.EMERGENCY).count(),
                "by_status": dict(qs.values("status").annotate(total=Count("id")).values_list("status", "total")),
                "by_type": dict(
                    qs.values("maintenance_type").annotate(total=Count("id")).values_list("maintenance_type", "total")
                ),
            }
        )


class ATMReportView(APIView):
    def get(self, request, pk):
        atms = scoped(request.user)[2]
        atm = atms.filter(pk=pk).first()
        if not atm:
            return Response({"detail": "Not found within your organizational scope."}, status=404)
        incidents = Incident.objects.filter(atm=atm).order_by("-created_at")
        return Response(
            {
                "atm": {
                    "reference": atm.reference,
                    "name": atm.name,
                    "status": atm.status,
                    "health": atm.health,
                    "is_active": atm.is_active,
                    "operational_state": atm.operational_state,
                    "branch": atm.branch.name,
                    "district": atm.branch.district.name,
                    "atm_type": atm.atm_type,
                    "installation_date": atm.installation_date,
                    "created_at": atm.created_at,
                    "manufacturer": atm.manufacturer,
                    "model": atm.model,
                    "serial_number": atm.serial_number,
                    "location": atm.location,
                    "address": atm.address,
                    "ip_address": atm.ip_address,
                },
                "incident_count": incidents.count(),
                "by_status": dict(incidents.values("status").annotate(total=Count("id")).values_list("status", "total")),
                "recent_incidents": [
                    {
                        "incident_id": incident.incident_id,
                        "title": incident.title,
                        "status": incident.status,
                        "priority": incident.priority,
                        "created_at": incident.created_at,
                    }
                    for incident in incidents[:10]
                ],
            }
        )


class GlobalSearchView(APIView):
    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        if not term:
            return Response({"atms": [], "incidents": [], "branches": [], "technicians": [], "reports": [], "maintenance": []})
        _, branches, atms, incidents, reports = scoped(request.user)
        users = User.objects.all()
        if request.user.district_id:
            users = users.filter(district_id=request.user.district_id)
        maintenance = Maintenance.objects.filter(atm__in=atms)
        return Response(
            {
                "atms": [
                    {
                        "id": atm.id,
                        "reference": atm.reference,
                        "name": atm.name,
                        "branch": atm.branch.name,
                        "status": atm.status,
                        "is_active": atm.is_active,
                    }
                    for atm in atms.filter(
                        Q(reference__icontains=term)
                        | Q(name__icontains=term)
                        | Q(serial_number__icontains=term)
                        | Q(branch__name__icontains=term)
                    )[:8]
                ],
                "incidents": [
                    {
                        "id": incident.id,
                        "incident_number": incident.incident_id,
                        "title": incident.title,
                        "atm_reference": incident.atm.reference,
                        "status": incident.status,
                        "priority": incident.priority,
                        "assigned_to_name": incident.assigned_to.full_name if incident.assigned_to else None,
                    }
                    for incident in incidents.filter(
                        Q(title__icontains=term)
                        | Q(error_message__icontains=term)
                        | Q(description__icontains=term)
                        | Q(atm__reference__icontains=term)
                    )[:8]
                ],
                "reports": [
                    {
                        "id": report.id,
                        "report_id": report.report_id,
                        "atm_reference": report.atm.reference,
                        "status": report.status,
                        "severity": report.severity,
                    }
                    for report in reports.filter(
                        Q(description__icontains=term) | Q(atm__reference__icontains=term)
                    )[:8]
                ],
                "maintenance": [
                    {
                        "id": job.id,
                        "maintenance_id": job.maintenance_id,
                        "atm_reference": job.atm.reference,
                        "status": job.status,
                        "maintenance_type": job.maintenance_type,
                    }
                    for job in maintenance.filter(
                        Q(reason__icontains=term) | Q(atm__reference__icontains=term)
                    )[:8]
                ],
                "branches": [
                    {"id": branch.id, "name": branch.name, "code": branch.code}
                    for branch in branches.filter(Q(name__icontains=term) | Q(code__icontains=term))[:8]
                ],
                "technicians": [
                    {"id": tech.id, "name": tech.full_name or tech.username, "username": tech.username}
                    for tech in users.filter(
                        Q(full_name__icontains=term) | Q(username__icontains=term), role="TECHNICIAN"
                    )[:8]
                ],
            }
        )
