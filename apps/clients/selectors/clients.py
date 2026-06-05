from django.db.models import Count, Q

from apps.clients.models import Client, ClientContact


def get_client_queryset():
    return (
        Client.objects.filter(is_active=True)
        .select_related("workspace", "workspace__organization")
        .annotate(
            transaction_count=Count(
                "gst_transactions",
                filter=Q(gst_transactions__is_active=True),
                distinct=True,
            )
        )
    )


def get_client_contact_queryset():
    return ClientContact.objects.filter(is_active=True).select_related("client", "client__workspace", "client__workspace__organization")
