from apps.approvals.models import ApprovalRequest


def get_approval_request_queryset():
    return ApprovalRequest.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "requested_to",
        "resolved_by",
    )
