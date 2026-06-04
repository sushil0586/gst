from apps.accounts.models import WorkspaceMembership
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace


def get_user_memberships(user):
    if user and getattr(user, "is_superuser", False):
        return (
            WorkspaceMembership.objects.filter(is_active=True)
            .select_related("workspace", "workspace__organization")
            .order_by("workspace__organization__name", "workspace__name")
        )
    return (
        WorkspaceMembership.objects.filter(user=user, is_active=True)
        .select_related("workspace", "workspace__organization")
        .order_by("created_at")
    )


def get_user_workspace_queryset(user):
    if user and getattr(user, "is_superuser", False):
        return Workspace.objects.filter(is_active=True).select_related("organization").distinct()
    workspace_ids = get_user_memberships(user).values_list("workspace_id", flat=True)
    return Workspace.objects.filter(id__in=workspace_ids, is_active=True).select_related("organization").distinct()


def get_user_organization_queryset(user):
    if user and getattr(user, "is_superuser", False):
        return Organization.objects.filter(is_active=True).distinct().order_by("name")
    organization_ids = get_user_memberships(user).values_list("workspace__organization_id", flat=True)
    return Organization.objects.filter(id__in=organization_ids, is_active=True).distinct().order_by("name")
