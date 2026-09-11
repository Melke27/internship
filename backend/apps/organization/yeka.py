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


DEFAULT_DEPARTMENTS = [
    {
        "name": "ATM Operations & Monitoring",
        "code": "DEP-OPS",
        "department_type": "OPERATIONS",
        "description": "Central district monitoring, terminal health management, and operational dispatch.",
        "email": "atm-ops.yeka@cbe.com.et",
        "phone": "+251 11 661 0001",
    },
    {
        "name": "IT Infrastructure & Support",
        "code": "DEP-IT",
        "department_type": "TECHNICAL",
        "description": "Network connectivity, switch interface, hardware diagnostics, and firmware updates.",
        "email": "it-support.yeka@cbe.com.et",
        "phone": "+251 11 661 0002",
    },
    {
        "name": "Maintenance & Engineering",
        "code": "DEP-MAINT",
        "department_type": "MAINTENANCE",
        "description": "Preventive maintenance, field technician assignments, hardware repair, and spare parts management.",
        "email": "maintenance.yeka@cbe.com.et",
        "phone": "+251 11 661 0003",
    },
    {
        "name": "Audit, Risk & Compliance",
        "code": "DEP-AUDIT",
        "department_type": "AUDIT",
        "description": "Security compliance, audit log review, access control validation, and SLA enforcement.",
        "email": "audit.yeka@cbe.com.et",
        "phone": "+251 11 661 0004",
    },
    {
        "name": "Cash Replenishment & Vault Services",
        "code": "DEP-CASH",
        "department_type": "ADMINISTRATION",
        "description": "Cash loading management, cassette balancing, vault reconciliation, and transport logistics.",
        "email": "cash-ops.yeka@cbe.com.et",
        "phone": "+251 11 661 0005",
    },
]


def ensure_default_departments():
    from apps.organization.models import Department
    district = get_yeka_district()
    departments = []
    for data in DEFAULT_DEPARTMENTS:
        dept, _ = Department.objects.get_or_create(
            code=data["code"],
            defaults={
                "name": data["name"],
                "district": district,
                "department_type": data["department_type"],
                "description": data["description"],
                "email": data["email"],
                "phone": data["phone"],
                "status": "ACTIVE",
            },
        )
        departments.append(dept)
    return departments

