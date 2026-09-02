from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.assets.models import ATM, Maintenance
from apps.incidents.models import BranchReport, Incident, TroubleshootingAction, Resolution, Verification, Escalation
from apps.organization.models import Branch, District
from apps.organization.yeka import get_yeka_district

CORE_USERNAMES = {"admin", "district.admin", "maintenance.tech"}


class Command(BaseCommand):
    help = "Wipe all operational/test data (ATMs, incidents, reports, maintenance) and any test branches/users, leaving Yeka District, the core branch, and core accounts."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        yeka = get_yeka_district()

        self.stdout.write(self.style.WARNING("Wiping all operational and test data..."))

        atms = ATM.objects.all()
        test_branches = Branch.objects.exclude(code="MEG002")
        test_users = User.objects.all().exclude(username__in=CORE_USERNAMES)

        incidents_count = Incident.objects.filter(atm__in=atms).delete()[0]
        reports_count = BranchReport.objects.all().delete()[0]
        # troubleshooting/resolution/etc delete with incidents via CASCADE

        Escalation.objects.all().delete()
        TroubleshootingAction.objects.all().delete()
        Resolution.objects.all().delete()
        Verification.objects.all().delete()

        maintenance_count = Maintenance.objects.all().delete()[0]
        atms_count = atms.delete()[0]

        users_count = test_users.delete()[0]
        branches_count = test_branches.delete()[0]

        self.stdout.write(
            self.style.SUCCESS(
                f"Wiped:\n"
                f"  {atms_count} ATM(s)\n"
                f"  {incidents_count} incident(s)\n"
                f"  {reports_count} branch report(s)\n"
                f"  {maintenance_count} maintenance record(s)\n"
                f"  {users_count} test user(s)\n"
                f"  {branches_count} test branch(es)\n"
                f"\nKept: Yeka District, MEGENAGNA branch structure, and core accounts."
            )
        )
