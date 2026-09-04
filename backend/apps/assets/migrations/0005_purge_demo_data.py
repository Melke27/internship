from django.db import migrations
from django.core.management import call_command


def purge_demo_data_on_deploy(apps, schema_editor):
    try:
        call_command('purge_demo_data')
    except Exception as e:
        print(f"Warning during purge_demo_data migration: {e}")


def reverse_purge(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0004_atm_photo'),
    ]

    operations = [
        migrations.RunPython(purge_demo_data_on_deploy, reverse_code=reverse_purge),
    ]
