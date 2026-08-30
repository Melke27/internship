from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.organization.models import Branch
from apps.organization.yeka import get_yeka_district


class Command(BaseCommand):
    help = "Create one local account for each portal without changing existing users."

    def add_arguments(self, parser):
        parser.add_argument("--password", required=True, help="Temporary password for all three accounts.")
        parser.add_argument("--branch-name", default="Demo Branch")
        parser.add_argument("--branch-code", default="DEMO")

    @transaction.atomic
    def handle(self, *args, **options):
        password = options["password"]
        try:
            validate_password(password)
        except Exception as error:
            raise CommandError("Choose a stronger password: " + " ".join(error.messages)) from error

        district = get_yeka_district()
        branch, _ = Branch.objects.get_or_create(
            district=district,
            code=options["branch_code"],
            defaults={"name": options["branch_name"], "status": "ACTIVE"},
        )
        accounts = (
            ("district.admin", "district.admin@example.test", "District Administrator", User.Role.DISTRICT_ADMIN, None),
            ("maintenance.tech", "maintenance.tech@example.test", "Maintenance Technician", User.Role.TECHNICIAN, None),
            ("branch.user", "branch.user@example.test", "Branch User", User.Role.BRANCH_USER, branch),
        )

        for username, email, full_name, role, assigned_branch in accounts:
            if User.objects.filter(username=username).exists():
                self.stdout.write(self.style.WARNING(f"Skipped existing account: {username}"))
                continue
            User.objects.create_user(
                username=username,
                email=email,
                full_name=full_name,
                role=role,
                district=district,
                branch=assigned_branch,
                password=password,
            )
            self.stdout.write(self.style.SUCCESS(f"Created {username} ({role})"))

        self.stdout.write(self.style.SUCCESS("Portal accounts are ready. Change temporary passwords before real use."))
