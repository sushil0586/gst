from django.db.models import Q
from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.reconciliation.models import ReconciliationItem
from apps.reconciliation.selectors.reconciliation import (
    get_reconciliation_item_queryset,
    get_reconciliation_run_queryset,
)
from apps.reconciliation.serializers import (
    ReconciliationItemBooksCreateSerializer,
    ReconciliationItemBooksCorrectionSerializer,
    ReconciliationItemActionSerializer,
    ReconciliationItemSerializer,
    ReconciliationRunSerializer,
    TransactionCorrectionSerializer,
)
from apps.reconciliation.services.reconciliation import (
    apply_reconciliation_item_books_correction,
    create_reconciliation_item_books_entry,
    create_reconciliation_run,
    update_reconciliation_item,
)
from rest_framework.decorators import action
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin, UpdateModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet


class ReconciliationRunViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, GenericViewSet):
    serializer_class = ReconciliationRunSerializer
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "run_type", "status"]
    ordering_fields = ["created_at", "processed_at", "matched_count", "mismatch_count", "total_itc_at_risk"]

    def get_queryset(self):
        return get_reconciliation_run_queryset()

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "run_reconciliation"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        run_id = self.kwargs.get("pk")
        if run_id:
            run = get_reconciliation_run_queryset().filter(pk=run_id).first()
            return (run.workspace if run else None), (run.client if run else None)
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
        return "Reconciliation Run"

    def create(self, request, *args, **kwargs):
        return StandardizedModelViewSet.create(self, request, *args, **kwargs)

    def perform_create(self, serializer):
        return create_reconciliation_run(serializer=serializer, user=self.request.user)

    @action(detail=True, methods=["get"], url_path="items")
    def items(self, request, pk=None):
        self.get_object()
        queryset = get_reconciliation_item_queryset().filter(reconciliation_run_id=pk)

        match_status = request.query_params.get("match_status")
        if match_status:
            queryset = queryset.filter(match_status=match_status)
        action_status = request.query_params.get("action_status")
        if action_status:
            queryset = queryset.filter(action_status=action_status)
        issue_bucket = request.query_params.get("issue_bucket")
        if issue_bucket:
            queryset = queryset.filter(issue_bucket=issue_bucket)
        itc_status = request.query_params.get("itc_status")
        if itc_status:
            queryset = queryset.filter(itc_status=itc_status)
        assigned_to = request.query_params.get("assigned_to")
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)
        mismatch_reason = request.query_params.get("mismatch_reason")
        if mismatch_reason:
            queryset = queryset.filter(mismatch_reason=mismatch_reason)
        counterparty_gstin = request.query_params.get("counterparty_gstin")
        if counterparty_gstin:
            queryset = queryset.filter(
                Q(books_transaction__counterparty_gstin__icontains=counterparty_gstin)
                | Q(portal_transaction__counterparty_gstin__icontains=counterparty_gstin)
            )
        document_number = request.query_params.get("document_number")
        if document_number:
            queryset = queryset.filter(
                Q(books_transaction__reference_number__icontains=document_number)
                | Q(portal_transaction__reference_number__icontains=document_number)
            )

        page = self.paginate_queryset(queryset)
        serializer = ReconciliationItemSerializer(page or queryset, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data, message=self.success_message))


class ReconciliationItemViewSet(ListModelMixin, RetrieveModelMixin, UpdateModelMixin, GenericViewSet):
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = [
        "reconciliation_run",
        "match_status",
        "action_status",
        "assigned_to",
        "mismatch_reason",
        "issue_bucket",
        "period_relationship",
        "itc_status",
    ]
    search_fields = [
        "books_transaction__counterparty_name",
        "books_transaction__counterparty_gstin",
        "books_transaction__reference_number",
        "portal_transaction__reference_number",
    ]
    ordering_fields = ["created_at", "tax_difference", "taxable_difference", "total_difference"]

    def get_queryset(self):
        queryset = get_reconciliation_item_queryset()
        run_id = self.kwargs.get("run_pk") or self.request.query_params.get("run")
        if run_id:
            queryset = queryset.filter(reconciliation_run_id=run_id)
        counterparty_gstin = self.request.query_params.get("counterparty_gstin")
        if counterparty_gstin:
            queryset = queryset.filter(
                Q(books_transaction__counterparty_gstin__icontains=counterparty_gstin)
                | Q(portal_transaction__counterparty_gstin__icontains=counterparty_gstin)
            )
        document_number = self.request.query_params.get("document_number")
        if document_number:
            queryset = queryset.filter(
                Q(books_transaction__reference_number__icontains=document_number)
                | Q(portal_transaction__reference_number__icontains=document_number)
            )
        return queryset

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return ReconciliationItemActionSerializer
        return ReconciliationItemSerializer

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "run_reconciliation"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.reconciliation_run.workspace, obj.reconciliation_run.client
        run_id = self.kwargs.get("run_pk") or request.data.get("reconciliation_run") or request.query_params.get("run")
        if run_id:
            run = get_reconciliation_run_queryset().filter(pk=run_id).first()
            return (run.workspace if run else None), (run.client if run else None)
        return None, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return StandardizedModelViewSet.update(self, request, *args, partial=True, **kwargs)

    def perform_update(self, serializer):
        return update_reconciliation_item(serializer=serializer, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="correct-books-entry")
    def correct_books_entry(self, request, pk=None):
        item = self.get_object()
        serializer = ReconciliationItemBooksCorrectionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        correction = apply_reconciliation_item_books_correction(
            item=item,
            validated_data=serializer.validated_data,
            user=request.user,
        )
        output = TransactionCorrectionSerializer(correction, context={"request": request})
        return Response(
            api_response(
                data=output.data,
                message="Books correction saved and reconciliation rerun queued.",
            )
        )

    @action(detail=True, methods=["post"], url_path="create-books-entry")
    def create_books_entry(self, request, pk=None):
        item = self.get_object()
        serializer = ReconciliationItemBooksCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        correction = create_reconciliation_item_books_entry(
            item=item,
            validated_data=serializer.validated_data,
            user=request.user,
        )
        output = TransactionCorrectionSerializer(correction, context={"request": request})
        return Response(
            api_response(
                data=output.data,
                message="Books entry created and reconciliation rerun queued.",
            )
        )

    @action(detail=True, methods=["get"], url_path="corrections")
    def corrections(self, request, pk=None):
        item = self.get_object()
        if item.books_transaction_id is None:
            queryset = []
        else:
            queryset = item.books_transaction.corrections.select_related("applied_by").all()
        page = self.paginate_queryset(queryset)
        serializer = TransactionCorrectionSerializer(page or queryset, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data, message=self.success_message))

    @property
    def basename_title(self):
        return "Reconciliation Item"
