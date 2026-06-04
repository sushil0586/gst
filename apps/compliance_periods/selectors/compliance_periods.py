from apps.compliance_periods.models import CompliancePeriod


def get_compliance_period_queryset():
    return CompliancePeriod.objects.filter(is_active=True).select_related(
        "gstin",
        "gstin__client",
        "gstin__client__workspace",
        "locked_by",
    )
