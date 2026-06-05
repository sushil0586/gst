from apps.customer_operations.models import OperationalFollowUp


def get_operational_follow_up_queryset():
    return OperationalFollowUp.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "return_preparation",
        "return_filing",
        "notice",
        "contact",
        "assigned_to",
        "completed_by",
    )

