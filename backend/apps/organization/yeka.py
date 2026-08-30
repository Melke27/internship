"""Fixed single-district scope for Yeka District ATM Operations."""

YEKA_CODE = "YEKA"
YEKA_NAME = "Yeka District"


def get_yeka_district():
    from apps.organization.models import District

    district, created = District.objects.get_or_create(
        code=YEKA_CODE,
        defaults={
            "name": YEKA_NAME,
            "status": "ACTIVE",
            "description": "Fixed operational district for ATM technical operations.",
        },
    )
    if not created and district.name != YEKA_NAME:
        district.name = YEKA_NAME
        district.status = "ACTIVE"
        district.save(update_fields=["name", "status", "updated_at"])
    return district
