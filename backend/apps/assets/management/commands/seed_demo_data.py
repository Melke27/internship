from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.assets.models import ATM, Maintenance
from apps.incidents.models import BranchReport, Incident
from apps.organization.models import Branch
from apps.organization.yeka import get_yeka_district


class Command(BaseCommand):
    help = "Bootstrap a fresh deployment idempotently: demo users, Yeka district, demo branch, ATMs, incidents, branch reports and maintenance jobs."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="DemoPass123!", help="Temporary password for the three demo accounts.")
        parser.add_argument("--branch-name", default="Demo Branch")
        parser.add_argument("--branch-code", default="DEMO")
        parser.add_argument("--reset-passwords", action="store_true", help="Also reset demo passwords on existing accounts.")

    @transaction.atomic
    def handle(self, *args, **options):
        password = options["password"]
        branch_name = options["branch_name"]
        branch_code = options["branch_code"]
        reset_passwords = options["reset_passwords"]
        now = timezone.now()

        User = get_user_model()
        district = get_yeka_district()
        branch, _ = Branch.objects.get_or_create(
            district=district,
            code=branch_code,
            defaults={"name": branch_name, "status": "ACTIVE"},
        )

        (admin, tech, branch_user, _superadmin) = self._ensure_accounts(User, district, branch, password, reset_passwords)
        self._make_atms(branch, now)
        atms = ATM.objects.order_by("reference").all()
        self._make_incidents(atms, admin, tech, branch_user, now)
        self._make_reports(atms, branch_user, branch, now)
        self._make_maintenance(atms, admin, tech, now)

        self.stdout.write(self.style.SUCCESS("Demo data is ready. Login with district.admin / maintenance.tech / branch.user."))

    def _ensure_accounts(self, User, district, branch, password, reset_passwords):
        accounts = (
            ("district.admin", "district.admin@example.test", "District Administrator", User.Role.DISTRICT_ADMIN, None, False),
            ("maintenance.tech", "maintenance.tech@example.test", "Maintenance Technician", User.Role.TECHNICIAN, None, False),
            ("branch.user", "branch.user@example.test", "Branch User", User.Role.BRANCH_USER, branch, False),
            ("admin", "admin@example.test", "System Administrator", User.Role.DISTRICT_ADMIN, None, True),
        )
        users = []
        for username, email, full_name, role, assigned_branch, is_superuser in accounts:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(
                    email=email, full_name=full_name, role=role, district=district,
                    branch=assigned_branch, is_staff=is_superuser, is_superuser=is_superuser,
                ),
            )
            user.district = district
            user.email = email
            user.full_name = full_name
            user.role = role
            if assigned_branch:
                user.branch = assigned_branch
            user.is_active = True
            if is_superuser:
                user.is_staff = True
                user.is_superuser = True
            if created or reset_passwords:
                user.set_password(password)
            user.save()
            users.append(user)
            self.stdout.write(self.style.SUCCESS(f"{'Created' if created else 'Ensured'} account {username} ({'SUPERUSER/admin' if is_superuser else role})"))
        return users

    def _make_atms(self, branch, now):
        specs = [
            ("YKA-1001", ATM.TechnicalStatus.OPERATIONAL, ATM.Health.HEALTHY, "Main Lobby"),
            ("YKA-1002", ATM.TechnicalStatus.OPERATIONAL, ATM.Health.HEALTHY, "Ground Floor Hall"),
            ("YKA-1003", ATM.TechnicalStatus.WARNING, ATM.Health.WARNING, "Service Lane"),
            ("YKA-1004", ATM.TechnicalStatus.DEGRADED, ATM.Health.DEGRADED, "Lobby 2"),
            ("YKA-1005", ATM.TechnicalStatus.FAULT, ATM.Health.CRITICAL, "Main Hall"),
            ("YKA-1006", ATM.TechnicalStatus.OFFLINE, ATM.Health.OFFLINE, "Annex"),
            ("YKA-1007", ATM.TechnicalStatus.CRITICAL, ATM.Health.CRITICAL, "Main Lobby"),
            ("YKA-1008", ATM.TechnicalStatus.UNDER_REPAIR, ATM.Health.MAINTENANCE, "Service Area"),
            ("YKA-1009", ATM.TechnicalStatus.MAINTENANCE, ATM.Health.MAINTENANCE, "Basement"),
            ("YKA-1010", ATM.TechnicalStatus.OPERATIONAL, ATM.Health.HEALTHY, "Cash Centre"),
        ]
        count = 0
        for ref, status, health, location in specs:
            _, created = ATM.objects.get_or_create(
                reference=ref,
                defaults=dict(
                    name=f"{branch.name} {ref}",
                    branch=branch,
                    model="NCR SelfServ 86",
                    manufacturer="NCR",
                    location=location,
                    address="Yeka District Branch",
                    serial_number=f"SN-{ref}",
                    is_active=True,
                    status=status,
                    health=health,
                    network_status="ONLINE" if status != ATM.TechnicalStatus.OFFLINE else "OFFLINE",
                    power_status="ONLINE",
                    hardware_status="NORMAL" if status not in (ATM.TechnicalStatus.FAULT, ATM.TechnicalStatus.CRITICAL) else "FAULT",
                    communication_status="ONLINE" if status != ATM.TechnicalStatus.OFFLINE else "OFFLINE",
                    installation_date=now.date() - timedelta(days=220),
                    last_checked=now,
                ),
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Ensured {count} demo ATMs."))

    def _make_incidents(self, atms, admin, tech, branch_user, now):
        by_ref = {atm.reference: atm for atm in atms}
        specs = [
            ("YKA-1007", "CASH_DISPENSER", "CRITICAL", "ESCALATED",
             "Cash dispenser jammed and cash stuck",
             "Cash dispenser jammed during withdrawal; cash trapped, ATM set offline by customers.",
             "Dispenser module EPP4 error 51", "Cash withdrawal unavailable", tech),
            ("YKA-1005", "CARD_READER", "HIGH", "ASSIGNED",
             "Card reader fails to read magnetic stripes",
             "Branches report cards rejected repeatedly at this unit.",
             "CRT-7403 read failure", "Card transactions affected", tech),
            ("YKA-1006", "NETWORK_COMMUNICATION", "CRITICAL", "INVESTIGATING",
             "ATM offline - network connectivity lost",
             "Unit stopped communicating with the switch; no heartbeat received.",
             "No response from ATM", "Full service unavailable", tech),
            ("YKA-1003", "CASH_DISPENSER", "MEDIUM", "TROUBLESHOOTING",
             "Slow cash dispense performance",
             "Withdrawals take unusually long; occasional retries reported.",
             "Dispense timeout warnings", "Degraded service", tech),
            ("YKA-1010", "RECEIPT_PRINTER", "MEDIUM", "RESOLVED",
             "Receipt printer ribbon replace",
             "Faded receipts reported; ribbon replaced and test printed OK.",
             "", "None", tech),
            ("YKA-1002", "SOFTWARE", "LOW", "CLOSED",
             "Application slow after patch",
             "Resolved after monitoring; no recurrence.",
             "", "None", tech),
        ]
        created = 0
        for ref, category, priority, status, title, description, error_message, impact, assigned in specs:
            incident, was_created = Incident.objects.get_or_create(
                title=title,
                defaults=dict(
                    atm=by_ref[ref], category=category, priority=priority, status=status,
                    description=description, reported_by=branch_user, assigned_to=assigned,
                    error_message=error_message, service_impact=impact,
                ),
            )
            if was_created:
                created += 1
                if status == "RESOLVED" and incident.resolved_at is None:
                    incident.resolved_at = now
                    incident.save(update_fields=["resolved_at"])
                if status == "CLOSED" and incident.closed_at is None:
                    incident.closed_at = now - timedelta(hours=30)
                    incident.save(update_fields=["closed_at"])
        self.stdout.write(self.style.SUCCESS(f"Ensured {len(specs)} incidents ({created} new)."))

    def _make_reports(self, atms, branch_user, branch, now):
        by_ref = {atm.reference: atm for atm in atms}
        specs = [
            ("YKA-1007", "CASH_DISPENSER", "HIGH", "REVIEWING", "Dispenser became noisy, then stopped dispensing cash entirely."),
            ("YKA-1006", "NETWORK_COMMUNICATION", "CRITICAL", "RECEIVED", "ATM shows offline on the branch console and cannot be reached."),
            ("YKA-1004", "DISPLAY", "MEDIUM", "SUBMITTED", "Screen flickers intermittently during keypad use."),
        ]
        for ref, problem_type, severity, status, description in specs:
            BranchReport.objects.get_or_create(
                atm=by_ref[ref], problem_type=problem_type, severity=severity, status=status,
                defaults=dict(branch=branch, reported_by=branch_user, description=description),
            )
        self.stdout.write(self.style.SUCCESS(f"Ensured {len(specs)} branch reports."))

    def _make_maintenance(self, atms, admin, tech, now):
        by_ref = {atm.reference: atm for atm in atms}
        specs = [
            ("YKA-1008", "EMERGENCY", "CRITICAL", "UNDER_REPAIR", "Cash dispenser half-plate requires exchange.", True),
            ("YKA-1009", "CORRECTIVE", "HIGH", "IN_PROGRESS", "Maintenance replaces worn display touch screen.", True),
            ("YKA-1004", "PREVENTIVE", "MEDIUM", "ASSIGNED", "Scheduled preventive inspection and cleaning.", True),
            ("YKA-1003", "PREVENTIVE", "LOW", "REQUESTED", "Annual preventive maintenance request.", False),
            ("YKA-1002", "PREVENTIVE", "MEDIUM", "VERIFIED", "Preventive service completed and verified.", True),
            ("YKA-1010", "CORRECTIVE", "MEDIUM", "COMPLETED", "Receipt printer ribbon replacement.", True),
        ]
        for ref, mtype, priority, status, reason, assigned in specs:
            Maintenance.objects.get_or_create(
                atm=by_ref[ref], maintenance_type=mtype, reason=reason,
                defaults=dict(priority=priority, status=status, technician=tech if assigned else None, requested_by=admin),
            )
        self.stdout.write(self.style.SUCCESS(f"Ensured {len(specs)} maintenance jobs."))