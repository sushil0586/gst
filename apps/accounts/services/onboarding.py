from apps.accounts.models import WorkspaceMembership, WorkspaceRole


def ensure_workspace_membership(*, user, workspace, role=WorkspaceRole.OWNER):
    membership, created = WorkspaceMembership.objects.get_or_create(
        user=user,
        workspace=workspace,
        defaults={
            "role": role,
            "created_by": user,
            "updated_by": user,
        },
    )
    if not created and membership.role != role:
        membership.role = role
        membership.updated_by = user
        membership.save(update_fields=["role", "updated_by", "updated_at"])
    return membership
