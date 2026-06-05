from apps.accounts.constants import PERMISSIONS, ROLE_PERMISSION_MAP
from apps.accounts.models import WorkspaceMembership


def get_workspace_role(user, workspace):
    if not user or not user.is_authenticated or workspace is None:
        return None
    if getattr(user, "is_superuser", False):
        return "platform_admin"
    membership = (
        WorkspaceMembership.objects.filter(user=user, workspace=workspace, is_active=True)
        .only("role")
        .first()
    )
    return membership.role if membership is not None else None


def user_has_any_workspace_role(user, workspace, allowed_roles):
    role = get_workspace_role(user, workspace)
    if role == "platform_admin":
        return True
    return role in set(allowed_roles)


def has_permission(user, workspace, client, permission_code):
    if permission_code not in PERMISSIONS:
        return False
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    role = get_workspace_role(user, workspace)
    if role is None:
        return False
    if client is not None and getattr(client, "workspace_id", None) != workspace.id:
        return False
    if role == "platform_admin":
        return True
    return permission_code in ROLE_PERMISSION_MAP.get(role, set())


def has_any_permission(user, workspace, client, permission_codes):
    valid_codes = [permission_code for permission_code in permission_codes if permission_code in PERMISSIONS]
    if not valid_codes:
        return False
    return any(has_permission(user, workspace, client, permission_code) for permission_code in valid_codes)


def can_manage_organization_workspaces(user, organization):
    if not user or not user.is_authenticated or organization is None:
        return False
    if getattr(user, "is_superuser", False):
        return True

    memberships = WorkspaceMembership.objects.filter(
        user=user,
        workspace__organization=organization,
        is_active=True,
    ).only("role")

    for membership in memberships:
        if "manage_settings" in ROLE_PERMISSION_MAP.get(membership.role, set()):
            return True
    return False
