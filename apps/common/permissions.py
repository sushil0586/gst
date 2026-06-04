from rest_framework.permissions import BasePermission

from apps.accounts.services.rbac import has_any_permission, has_permission


def _resolve_permission_codes(view, request):
    if hasattr(view, "get_permission_codes"):
        return list(view.get_permission_codes(request) or [])
    permission_code = view.get_permission_code(request)
    if permission_code is None:
        return []
    return [permission_code]


class WorkspaceRBACPermission(BasePermission):
    def has_permission(self, request, view):
        permission_codes = _resolve_permission_codes(view, request)
        if not permission_codes:
            return True
        workspace, client = view.get_workspace_and_client(request)
        if workspace is None:
            return request.method not in {"GET", "HEAD", "OPTIONS"} or getattr(view, "action", None) in {
                "retrieve",
                "update",
                "partial_update",
                "destroy",
            }
        return has_any_permission(request.user, workspace, client, permission_codes)

    def has_object_permission(self, request, view, obj):
        permission_codes = _resolve_permission_codes(view, request)
        if not permission_codes:
            return True
        workspace, client = view.get_workspace_and_client(request, obj=obj)
        if workspace is None:
            return False
        return has_any_permission(request.user, workspace, client, permission_codes)
