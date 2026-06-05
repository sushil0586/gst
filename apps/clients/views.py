from rest_framework.decorators import action
from rest_framework.response import Response

from apps.clients.selectors.clients import get_client_contact_queryset, get_client_queryset
from apps.clients.serializers import (
    ClientBootstrapResultSerializer,
    ClientBootstrapSerializer,
    ClientContactSerializer,
    ClientSerializer,
)
from apps.clients.services.clients import (
    create_client,
    create_client_bootstrap,
    create_client_contact,
    deactivate_client,
    deactivate_client_contact,
    update_client,
    update_client_contact,
)
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


class ClientContactViewSet(StandardizedModelViewSet):
    serializer_class = ClientContactSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Client Contact"
    filterset_fields = ["client", "is_primary", "is_active"]
    search_fields = ["name", "designation", "mobile_number", "email", "client__legal_name"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return get_client_contact_queryset()

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        contact = obj if obj is not None else None
        if contact is not None:
            return contact.client.workspace, contact.client
        client_id = request.data.get("client") or request.query_params.get("client")
        from apps.clients.models import Client

        client = Client.objects.select_related("workspace").filter(pk=client_id, is_active=True).first() if client_id else None
        workspace = client.workspace if client is not None else None
        return workspace, client

    def perform_create(self, serializer):
        return create_client_contact(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_client_contact(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_client_contact(instance=instance, user=self.request.user)
