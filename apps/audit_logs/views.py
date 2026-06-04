from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from apps.audit_logs.selectors.audit_logs import get_audit_log_queryset
from apps.audit_logs.serializers import AuditLogListSerializer, AuditLogSerializer
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.workspaces.models import Workspace


class AuditLogViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [WorkspaceRBACPermission]
    queryset = get_audit_log_queryset()
    success_message = "Success"
    filterset_fields = ["workspace_id_ref", "client_id_ref", "gstin_id_ref", "compliance_period_id_ref", "action", "entity_type", "actor"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        queryset = get_audit_log_queryset()
        period_id = self.request.query_params.get("period")
        if period_id:
            queryset = queryset.filter(compliance_period_id_ref=period_id)
        gstin_id = self.request.query_params.get("gstin")
        if gstin_id:
            queryset = queryset.filter(gstin_id_ref=gstin_id)
        actor_id = self.request.query_params.get("actor")
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)
        date_from = self.request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        date_to = self.request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AuditLogSerializer
        return AuditLogListSerializer

    def get_permission_code(self, request):
        return "view_audit_log"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None and obj.workspace_id_ref:
            workspace = Workspace.objects.filter(pk=obj.workspace_id_ref).first()
            return workspace, None
        workspace_id = request.query_params.get("workspace_id_ref")
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)
