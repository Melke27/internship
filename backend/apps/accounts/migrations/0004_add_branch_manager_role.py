# Generated manually for BRANCH_MANAGER role

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_alter_user_role"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("DISTRICT_ADMIN", "District Admin"),
                    ("OPERATIONS_OFFICER", "Operations Officer"),
                    ("MAINTENANCE_SUPERVISOR", "Maintenance Supervisor"),
                    ("TECHNICIAN", "Technician"),
                    ("BRANCH_MANAGER", "Branch Manager"),
                    ("BRANCH_USER", "Branch User"),
                    ("AUDITOR", "Auditor"),
                    ("ADMINISTRATOR", "Administrator"),
                    ("SUPERVISOR", "Supervisor"),
                    ("MONITORING_OFFICER", "Monitoring Officer"),
                ],
                default="AUDITOR",
                max_length=32,
            ),
        ),
    ]
