from apps.accounts.models import WorkspaceMembership


def get_workspace_memberships_for_user(user):
    return WorkspaceMembership.objects.filter(user=user, is_active=True).select_related("workspace")
