from apps.returns.models import ReturnPreparation


def get_return_preparation_queryset():
    return ReturnPreparation.objects.filter(is_active=True).select_related(
        "compliance_period",
        "compliance_period__gstin",
        "compliance_period__gstin__client",
        "compliance_period__gstin__client__workspace",
        "prepared_by",
        "approved_by",
        "filed_by",
    )
