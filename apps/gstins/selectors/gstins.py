from apps.gstins.models import GSTIN


def get_gstin_queryset():
    return GSTIN.objects.filter(is_active=True).select_related("client", "client__workspace")
