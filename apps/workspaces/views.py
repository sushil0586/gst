from django.conf import settings
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.cache_utils import get_cached_or_build, scoped_cache_key
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.common.viewsets import StandardizedModelViewSet
from apps.workspaces.selectors.workspaces import get_workspace_queryset
from apps.workspaces.serializers import WorkspaceContextSerializer, WorkspaceSerializer
from apps.workspaces.services.workspaces import create_workspace, deactivate_workspace, update_workspace


class WorkspaceViewSet(StandardizedModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]
    resource_name = "Workspace"
    filterset_fields = ["organization", "is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return get_workspace_queryset(self.request.user)

    def perform_create(self, serializer):
        return create_workspace(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_workspace(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_workspace(instance=instance, user=self.request.user)

    @action(detail=False, methods=["get"], url_path="context")
    def context(self, request, *args, **kwargs):
        workspace_id = request.query_params.get("workspace")
        workspace_queryset = get_workspace_queryset(request.user)
        workspace = (
            workspace_queryset.filter(pk=workspace_id).first()
            if workspace_id
            else workspace_queryset.first()
        )
        if workspace is None:
            return Response(
                api_response(
                    data={
                        "workspace": None,
                        "clients": [],
                        "gstins": [],
                        "periods": [],
                    }
                )
            )

        cache_key = scoped_cache_key(
            "workspace-context",
            user_id=request.user.id,
            workspace_id=workspace.id,
        )

        def build_payload():
            clients = list(
                Client.objects.filter(is_active=True, workspace_id=workspace.id).order_by("legal_name")
            )
            gstins = list(
                GSTIN.objects.filter(is_active=True, client__workspace_id=workspace.id)
                .select_related("client")
                .order_by("gstin")
            )
            periods = list(
                CompliancePeriod.objects.filter(is_active=True, gstin__client__workspace_id=workspace.id)
                .select_related("gstin", "locked_by")
                .order_by("-period")
            )

            serializer = WorkspaceContextSerializer(
                {
                    "workspace": workspace,
                    "clients": clients,
                    "gstins": gstins,
                    "periods": periods,
                }
            )
            return api_response(data=serializer.data)

        payload = get_cached_or_build(
            cache_key,
            settings.CACHE_WORKSPACE_CONTEXT_SECONDS,
            build_payload,
        )
        return Response(payload)
