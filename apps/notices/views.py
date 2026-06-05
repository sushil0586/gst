from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin, UpdateModelMixin
from rest_framework.viewsets import GenericViewSet

from apps.clients.models import Client
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.gstins.models import GSTIN
from apps.notices.selectors.notices import get_notice_queryset
from apps.notices.serializers import NoticeSerializer
from apps.workspaces.models import Workspace
from apps.notices.services.notices import create_notice, update_notice


class NoticeViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, UpdateModelMixin, GenericViewSet):
    serializer_class = NoticeSerializer
    permission_classes = [WorkspaceRBACPermission]
    queryset = get_notice_queryset()
    filterset_fields = ["status", "is_active", "assigned_to"]
    search_fields = ["reference_number", "title", "description", "gstin__gstin", "gstin__client__legal_name"]
    ordering_fields = ["created_at", "updated_at", "reference_number", "status", "due_date"]
    success_message = "Success"

    def get_queryset(self):
        queryset = get_notice_queryset()
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        assigned_to = self.request.query_params.get("assigned_to")

        if workspace_id:
            queryset = queryset.filter(gstin__client__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(gstin__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if assigned_to == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        elif assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)

        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_gstin"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.gstin.client.workspace, obj.gstin.client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client_id = request.data.get("client") or request.query_params.get("client")
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")

        if gstin_id:
            gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first()
            return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)

        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client

        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id).first()
            return workspace, None

        return None, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Notice"

    def create(self, request, *args, **kwargs):
        return StandardizedModelViewSet.create(self, request, *args, **kwargs)

    def perform_create(self, serializer):
        return create_notice(serializer=serializer, user=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        return StandardizedModelViewSet.update(self, request, *args, partial=True, **kwargs)

    def perform_update(self, serializer):
        return update_notice(serializer=serializer, user=self.request.user)
