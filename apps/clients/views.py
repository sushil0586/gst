from rest_framework.decorators import action
from rest_framework.response import Response

from apps.clients.selectors.clients import get_client_queryset
from apps.clients.serializers import ClientBootstrapResultSerializer, ClientBootstrapSerializer, ClientSerializer
from apps.clients.services.clients import create_client, create_client_bootstrap, deactivate_client, update_client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.workspaces.models import Workspace


class ClientViewSet(StandardizedModelViewSet):
    serializer_class = ClientSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Client"
    filterset_fields = ["workspace", "pan", "is_active"]
    search_fields = ["legal_name", "trade_name", "client_code", "pan"]
    ordering_fields = ["legal_name", "created_at"]

    def get_queryset(self):
        return get_client_queryset()

    def get_serializer_class(self):
        if self.action == "bootstrap":
            return ClientBootstrapSerializer
        return ClientSerializer

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        client = obj if obj is not None else None
        if client is not None:
            return client.workspace, client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, client

    def perform_create(self, serializer):
        return create_client(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_client(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_client(instance=instance, user=self.request.user)

    @action(detail=False, methods=["post"], url_path="bootstrap")
    def bootstrap(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_client_bootstrap(validated_data=serializer.validated_data, user=request.user)
        output = ClientBootstrapResultSerializer(result)
        return Response(api_response(data=output.data, message="Client and GSTIN created"), status=201)
