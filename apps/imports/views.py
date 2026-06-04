from django.db import models
from rest_framework.decorators import action
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.imports.models import ImportRowError
from apps.imports.selectors.imports import get_import_batch_queryset, get_import_template_queryset
from apps.imports.serializers import (
    FetchGSTR2BImportSerializer,
    ImportBatchSerializer,
    ImportCorrectionPolicySerializer,
    ImportImpactSummarySerializer,
    ImportBatchDiscardSerializer,
    ImportBatchReprocessSerializer,
    ImportBatchReplacementSerializer,
    ImportRowErrorSerializer,
    ImportRowCorrectionSerializer,
    ImportRowDiscardSerializer,
    ImportTemplateSerializer,
)
from apps.imports.services.correction_policy import build_import_impact_summary, evaluate_import_correction_policy
from apps.imports.services.imports import (
    correct_import_batch_row,
    discard_import_batch,
    discard_import_batch_row,
    fetch_gstr2b_import_batch,
    reprocess_import_batch,
    replace_import_batch_file,
    create_import_batch,
    create_import_template,
    deactivate_import_template,
    update_import_template,
)
from apps.workspaces.models import Workspace


class ImportBatchViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, GenericViewSet):
    serializer_class = ImportBatchSerializer
    permission_classes = [WorkspaceRBACPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    success_message = "Success"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "import_type", "source_type", "status"]
    search_fields = ["file_name", "import_type", "source_type"]
    ordering_fields = ["created_at", "processed_at", "status"]

    def get_queryset(self):
        queryset = get_import_batch_queryset()
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        return queryset.annotate(transaction_count=models.Count("transactions", distinct=True)).order_by("-created_at")

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "import_data"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        batch_id = self.kwargs.get("pk")
        if batch_id:
            batch = self.get_queryset().filter(pk=batch_id).first()
            if batch is not None:
                return batch.workspace, batch.client
        client_id = request.data.get("client") or request.query_params.get("client")
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        compliance_period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period")
        compliance_period = (
            CompliancePeriod.objects.filter(pk=compliance_period_id)
            .select_related("gstin", "gstin__client", "gstin__client__workspace")
            .first()
            if compliance_period_id
            else None
        )
        client = compliance_period.gstin.client if compliance_period else None
        return (client.workspace if client else None), client

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Import Batch"

    def create(self, request, *args, **kwargs):
        return StandardizedModelViewSet.create(self, request, *args, **kwargs)

    def perform_create(self, serializer):
        return create_import_batch(serializer=serializer, user=self.request.user)

    @action(detail=False, methods=["post"], url_path="fetch-gstr2b")
    def fetch_gstr2b(self, request):
        serializer = FetchGSTR2BImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        batch = fetch_gstr2b_import_batch(validated_data=serializer.validated_data, user=request.user)
        output = ImportBatchSerializer(batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="GSTR-2B fetched from provider"))

    @action(detail=True, methods=["get"], url_path="errors")
    def errors(self, request, pk=None):
        batch = self.get_object()
        queryset = ImportRowError.objects.filter(import_batch=batch).order_by("row_number", "created_at")
        page = self.paginate_queryset(queryset)
        serializer = ImportRowErrorSerializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["get"], url_path="correction-policy")
    def correction_policy(self, request, pk=None):
        batch = self.get_object()
        policy = evaluate_import_correction_policy(batch=batch, user=request.user)
        serializer = ImportCorrectionPolicySerializer(policy.to_dict())
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["get"], url_path="impact-summary")
    def impact_summary(self, request, pk=None):
        batch = self.get_object()
        summary = build_import_impact_summary(batch=batch, user=request.user)
        serializer = ImportImpactSummarySerializer(summary.to_dict())
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["post"], url_path="row-corrections")
    def row_corrections(self, request, pk=None):
        batch = self.get_object()
        serializer = ImportRowCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_batch = correct_import_batch_row(
            import_batch=batch,
            row_number=serializer.validated_data["row_number"],
            raw_row=serializer.validated_data["raw_row"],
            user=request.user,
        )
        output = ImportBatchSerializer(updated_batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Row correction applied and batch reprocessed"))

    @action(detail=True, methods=["post"], url_path="row-discards")
    def row_discards(self, request, pk=None):
        batch = self.get_object()
        serializer = ImportRowDiscardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_batch = discard_import_batch_row(
            import_batch=batch,
            row_number=serializer.validated_data["row_number"],
            user=request.user,
        )
        output = ImportBatchSerializer(updated_batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Row discarded and batch reprocessed"))

    @action(detail=True, methods=["post"], url_path="discard")
    def discard(self, request, pk=None):
        batch = self.get_object()
        serializer = ImportBatchDiscardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_batch = discard_import_batch(
            import_batch=batch,
            user=request.user,
        )
        output = ImportBatchSerializer(updated_batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Batch discarded"))

    @action(detail=True, methods=["post"], url_path="reprocess")
    def reprocess(self, request, pk=None):
        batch = self.get_object()
        serializer = ImportBatchReprocessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_batch = reprocess_import_batch(
            import_batch=batch,
            user=request.user,
        )
        output = ImportBatchSerializer(updated_batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Batch reprocessed"))

    @action(detail=True, methods=["post"], url_path="replace")
    def replace(self, request, pk=None):
        batch = self.get_object()
        serializer = ImportBatchReplacementSerializer(data=request.data, context={"batch": batch})
        serializer.is_valid(raise_exception=True)
        replacement_batch = replace_import_batch_file(
            import_batch=batch,
            validated_data=serializer.validated_data,
            user=request.user,
        )
        output = ImportBatchSerializer(replacement_batch, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Replacement batch created"), status=201)


class ImportTemplateViewSet(StandardizedModelViewSet):
    serializer_class = ImportTemplateSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Import Template"
    filterset_fields = ["workspace", "import_type", "source_type", "is_default", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return get_import_template_queryset()

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_settings"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, None
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, None

    def perform_create(self, serializer):
        return create_import_template(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_import_template(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_import_template(instance=instance, user=self.request.user)
