from apps.accounts.selectors.access import get_user_workspace_queryset
from apps.workspaces.models import Workspace


def get_workspace_queryset(user=None):
    if user and user.is_authenticated:
        return get_user_workspace_queryset(user)
    return Workspace.objects.none()
