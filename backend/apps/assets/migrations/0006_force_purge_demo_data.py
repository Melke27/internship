from django.db import migrations
from django.core.management import call_command


def force_purge_demo_data(apps, schema_editor):
    call_command('purge_demo_data')


def reverse_purge(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0005_purge_demo_data'),
    ]

    operations = [
        migrations.RunPython(force_purge_demo_data, reverse_code=reverse_purge),
    ]
