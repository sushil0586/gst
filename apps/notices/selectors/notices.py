from apps.notices.models import Notice


def get_notice_queryset():
    return Notice.objects.filter(is_active=True).select_related("gstin", "gstin__client", "gstin__client__workspace")
