from django.db import migrations, models

ROLE_MAP = {
    "SUPER_ADMIN": "ADMINISTRATOR",
    "DISTRICT": "SUPERVISOR",
    "BRANCH_MANAGER": "MONITORING_OFFICER",
    "REPORT_VIEWER": "AUDITOR",
    "TECHNICIAN": "TECHNICIAN",
    "AUDITOR": "AUDITOR",
}


def remap_roles(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for old, new in ROLE_MAP.items():
        User.objects.filter(role=old).update(role=new)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(remap_roles, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("ADMINISTRATOR", "Administrator"),
                    ("SUPERVISOR", "Supervisor"),
                    ("TECHNICIAN", "Technician"),
                    ("MONITORING_OFFICER", "Monitoring Officer"),
                    ("AUDITOR", "Read-Only / Auditor"),
                ],
                default="AUDITOR",
                max_length=32,
            ),
        ),
    ]
