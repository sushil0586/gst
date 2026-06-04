from apps.imports.models import ImportBatch, ImportTemplate


def get_import_batch_queryset():
    return ImportBatch.objects.filter(is_active=True).select_related(
        "workspace",
        "client",
        "gstin",
        "import_template",
        "compliance_period",
        "compliance_period__gstin",
        "compliance_period__gstin__client",
        "compliance_period__gstin__client__workspace",
    )


def get_import_template_queryset():
    return ImportTemplate.objects.filter(is_active=True).select_related("workspace")
