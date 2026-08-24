from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.gstins.models import GSTIN
from apps.ims.serializers import (
    IMSFileSerializer,
    IMSInvoicesCountSerializer,
    IMSInvoicesSerializer,
    IMSRejectedInvoicesSerializer,
    IMSResetSerializer,
    IMSSaveSerializer,
    IMSStatusSerializer,
    IMSSupplierInvoicesSerializer,
)
from apps.ims.services import (
    ims_get_file,
    ims_invoices,
    ims_invoices_count,
    ims_rejected_invoices,
    ims_reset,
    ims_save,
    ims_status,
    ims_supplier_invoices,
)
from apps.integrations.whitebooks.exceptions import WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.workspaces.models import Workspace


class IMSViewSet(GenericViewSet):
    permission_classes = [WorkspaceRBACPermission]

    def get_serializer_class(self):
        if self.action == "save":
            return IMSSaveSerializer
        if self.action == "reset":
            return IMSResetSerializer
        if self.action == "status":
            return IMSStatusSerializer
        if self.action == "invoices":
            return IMSInvoicesSerializer
        if self.action == "invoices_count":
            return IMSInvoicesCountSerializer
        if self.action == "supplier_invoices":
            return IMSSupplierInvoicesSerializer
        if self.action == "rejected_invoices":
            return IMSRejectedInvoicesSerializer
        if self.action == "file":
            return IMSFileSerializer
        return IMSSaveSerializer

    def get_permission_code(self, request):
        if self.action in {"save", "reset"}:
            return "file_return"
        return "view_client"

    def get_workspace_and_client(self, request, obj=None):
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client_id = request.data.get("client") or request.query_params.get("client")
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")

        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client

        if gstin_id:
            gstin_queryset = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace")
            if workspace_id:
                gstin_queryset = gstin_queryset.filter(client__workspace_id=workspace_id)
            gstin = gstin_queryset.first()
            if gstin is not None:
                return gstin.client.workspace, gstin.client

        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, None

    def _run(self, request, *, service, message):
        serializer = self.get_serializer(data=request.data if request.method != "GET" else request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            payload = service(validated_data=serializer.validated_data)
        except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            raise ValidationError({"provider": str(exc)}) from exc
        return Response(api_response(data=payload, message=message))

    @action(detail=False, methods=["post"], url_path="save")
    def save(self, request, *args, **kwargs):
        return self._run(request, service=ims_save, message="IMS draft saved")

    @action(detail=False, methods=["post"], url_path="reset")
    def reset(self, request, *args, **kwargs):
        return self._run(request, service=ims_reset, message="IMS draft reset")

    @action(detail=False, methods=["get"], url_path="status")
    def status(self, request, *args, **kwargs):
        return self._run(request, service=ims_status, message="IMS status fetched")

    @action(detail=False, methods=["get"], url_path="invoices")
    def invoices(self, request, *args, **kwargs):
        return self._run(request, service=ims_invoices, message="IMS invoices fetched")

    @action(detail=False, methods=["get"], url_path="invoices-count")
    def invoices_count(self, request, *args, **kwargs):
        return self._run(request, service=ims_invoices_count, message="IMS invoice count fetched")

    @action(detail=False, methods=["get"], url_path="supplier-invoices")
    def supplier_invoices(self, request, *args, **kwargs):
        return self._run(request, service=ims_supplier_invoices, message="IMS supplier invoices fetched")

    @action(detail=False, methods=["get"], url_path="rejected-invoices")
    def rejected_invoices(self, request, *args, **kwargs):
        return self._run(request, service=ims_rejected_invoices, message="IMS rejected invoices fetched")

    @action(detail=False, methods=["get"], url_path="file")
    def file(self, request, *args, **kwargs):
        return self._run(request, service=ims_get_file, message="IMS file fetched")
