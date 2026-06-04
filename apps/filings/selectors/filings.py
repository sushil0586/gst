from apps.filings.models import ReturnFiling, ReturnFilingAttempt, ReturnFilingEvent


def get_return_filing_queryset():
    return ReturnFiling.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "prepared_return",
        "approval_request",
        "approved_by",
        "filed_by",
        "created_by",
        "updated_by",
    )


def get_return_filing_attempt_queryset():
    return ReturnFilingAttempt.objects.filter(is_active=True).select_related(
        "return_filing",
        "return_filing__workspace",
        "return_filing__client",
        "return_filing__gstin",
        "return_filing__compliance_period",
        "triggered_by",
        "created_by",
        "updated_by",
    )


def get_return_filing_event_queryset():
    return ReturnFilingEvent.objects.select_related(
        "return_filing",
        "filing_attempt",
        "actor",
    )
