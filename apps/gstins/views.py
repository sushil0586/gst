from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.gstins.selectors.gstins import get_gstin_queryset
from apps.gstins.serializers import GSTINSerializer, TaxpayerSearchRequestSerializer, TaxpayerSearchResultSerializer
from apps.gstins.services.gstins import create_gstin, deactivate_gstin, search_taxpayer_details, update_gstin
from apps.integrations.whitebooks.exceptions import WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.workspaces.models import Workspace


class GSTINViewSet(StandardizedModelViewSet):
    serializer_class = GSTINSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "GSTIN"
    filterset_fields = ["client", "state_code", "is_active"]
    search_fields = ["gstin", "registration_type"]
    ordering_fields = ["gstin", "created_at"]

    def get_queryset(self):
        return get_gstin_queryset()

    def get_serializer_class(self):
        if self.action == "search_taxpayer":
            return TaxpayerSearchRequestSerializer
        return GSTINSerializer

    def get_permission_code(self, request):
        if self.action == "search_taxpayer":
            return "manage_client"
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_gstin"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.client.workspace, obj.client
        client_id = request.data.get("client") or request.query_params.get("client")
        client = Client.objects.filter(pk=client_id).select_related("workspace").first() if client_id else None
        if client:
            return client.workspace, client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, client

    def perform_create(self, serializer):
        return create_gstin(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_gstin(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_gstin(instance=instance, user=self.request.user)

    @action(detail=False, methods=["get"], url_path="search-taxpayer")
    def search_taxpayer(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        workspace = Workspace.objects.filter(pk=serializer.validated_data["workspace"]).first()
        if workspace is None:
            raise ValidationError({"workspace": "Workspace not found."})
        try:
            result = search_taxpayer_details(
                workspace=workspace,
                gstin=serializer.validated_data["gstin"],
                email=serializer.validated_data.get("email", ""),
                user=request.user,
            )
        except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            raise ValidationError({"gstin": str(exc)}) from exc
        output = TaxpayerSearchResultSerializer(result)
        return Response(api_response(data=output.data, message="Taxpayer details fetched"))
