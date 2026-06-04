from apps.accounts.selectors.access import get_user_organization_queryset
from apps.organizations.models import Organization


def get_organization_queryset(user=None):
    if user and user.is_authenticated:
        return get_user_organization_queryset(user)
    return Organization.objects.none()
