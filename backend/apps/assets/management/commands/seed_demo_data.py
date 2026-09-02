from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.organization.yeka import get_yeka_district


class Command(BaseCommand):
    help = "Bootstrap Yeka District and admin/demo accounts only. No fake ATMs or incidents."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="DemoPass123!", help="Password for demo accounts.")
        parser.add_argument("--reset-passwords", action="store_true", help="Reset passwords on existing accounts.")

    @transaction.atomic
    def handle(self, *args, **options):
        password = options["password"]
        reset_passwords = options["reset_passwords"]
        User = get_user_model()
        district = get_yeka_district()

        accounts = (
            ("admin", "System Administrator", User.Role.DISTRICT_ADMIN, None, True),
            ("district.admin", "District Administrator", User.Role.DISTRICT_ADMIN, None, False),
            ("maintenance.tech", "Maintenance Technician", User.Role.TECHNICIAN, None, False),
        )

        for username, full_name, role, branch, is_superuser in accounts:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(
                    email=f"{username}@cbe.example",
                    full_name=full_name,
                    role=role,
                    district=district,
                    branch=branch,
                    is_staff=is_superuser,
                    is_superuser=is_superuser,
                ),
            )
            user.district = district
            user.full_name = full_name
            user.role = role
            user.branch = branch
            user.is_active = True
            if is_superuser:
                user.is_staff = True
                user.is_superuser = True
            if created or reset_passwords:
                user.set_password(password)
            user.save()
            action = "Created" if created else "Ensured"
            self.stdout.write(self.style.SUCCESS(f"{action} account {username} ({role})"))

        self.stdout.write(self.style.SUCCESS("Bootstrap complete. Create branches and ATMs via the admin UI."))
