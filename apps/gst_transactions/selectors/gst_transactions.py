from apps.gst_transactions.models import GSTTransaction


def get_gst_transaction_queryset():
    return GSTTransaction.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "import_batch",
    )
