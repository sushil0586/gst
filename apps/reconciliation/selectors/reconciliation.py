from apps.reconciliation.models import ReconciliationItem, ReconciliationRun


def get_reconciliation_run_queryset():
    return ReconciliationRun.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "compliance_period__gstin",
        "compliance_period__gstin__client",
        "compliance_period__gstin__client__workspace",
    )


def get_reconciliation_item_queryset():
    return ReconciliationItem.objects.filter(is_active=True).select_related(
        "reconciliation_run",
        "reconciliation_run__workspace",
        "reconciliation_run__client",
        "books_transaction",
        "portal_transaction",
        "assigned_to",
    )
