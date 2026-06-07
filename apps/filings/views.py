from django.db.models import Prefetch
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.throttling import ProviderOTPRequestRateThrottle, ProviderOTPVerifyRateThrottle
from apps.common.viewsets import StandardizedModelViewSet
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling, ReturnFilingAttempt, ReturnFilingIncidentNote
from apps.filings.selectors.filings import (
    get_return_filing_attempt_queryset,
    get_return_filing_event_queryset,
    get_return_filing_queryset,
)
from apps.filings.serializers import (
    ReturnFilingActionSerializer,
    ReturnFilingAlertEscalationSerializer,
    ReturnFilingAttemptSerializer,
    ReturnFilingEventSerializer,
    ReturnFilingIncidentNoteCreateSerializer,
    ReturnFilingIncidentNoteResolveSerializer,
    ReturnFilingIncidentNoteSerializer,
    ReturnFilingOperationsSerializer,
    ReturnFilingRecoverySerializer,
    ReturnFilingSerializer,
    ReturnFilingStartSerializer,
    ProviderAuthRefreshSerializer,
    ProviderAuthSessionSerializer,
    ProviderOTPRequestSerializer,
    ProviderOTPVerifySerializer,
)
from apps.filings.services.filings import (
    create_return_filing,
    create_return_filing_incident_note,
    escalate_return_filing_operational_alerts,
    requeue_return_filing_after_review,
    resolve_return_filing_incident_note,
    retry_return_filing,
    sync_return_filing_status,
)
from apps.filings.services.provider_auth import request_provider_otp_session, verify_provider_otp_session
from apps.filings.services.provider_auth import refresh_provider_auth_session
from apps.workspaces.models import Workspace


class ReturnFilingViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "return_type", "provider", "status"]
    ordering_fields = ["created_at", "updated_at", "submitted_at", "filed_at"]

    def get_queryset(self):
        queryset = get_return_filing_queryset().prefetch_related(
            Prefetch(
                "attempts",
                queryset=ReturnFilingAttempt.objects.filter(is_active=True).order_by("-attempt_number"),
                to_attr="prefetched_attempts",
            ),
            Prefetch(
                "events",
                queryset=get_return_filing_event_queryset()
                .filter(event_type__in=ReturnFilingSerializer.INTERVENTION_EVENT_LABELS.keys())
                .order_by("-created_at"),
                to_attr="prefetched_events",
            ),
            Prefetch(
                "incident_notes",
                queryset=ReturnFilingIncidentNote.objects.filter(is_active=True).order_by("-created_at"),
                to_attr="prefetched_incident_notes",
            )
        )
        period_id = self.request.query_params.get("period")
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        return queryset

    def get_serializer_class(self):
        if self.action == "operations":
            return ReturnFilingOperationsSerializer
        if self.action == "start":
            return ReturnFilingStartSerializer
        if self.action == "requeue_after_review":
            return ReturnFilingRecoverySerializer
        if self.action == "escalate_alerts":
            return ReturnFilingAlertEscalationSerializer
        if self.action == "incident_notes" and self.request.method == "POST":
            return ReturnFilingIncidentNoteCreateSerializer
        if self.action == "resolve_incident_note":
            return ReturnFilingIncidentNoteResolveSerializer
        if self.action in {"retry", "resync"}:
            return ReturnFilingActionSerializer
        return ReturnFilingSerializer

    def get_permission_code(self, request):
        if self.action in {"start", "retry", "resync", "requeue_after_review"}:
            return "file_return"
        if self.action in {"incident_notes", "resolve_incident_note", "escalate_alerts"}:
            return "view_audit_log"
        return "view_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        filing_id = self.kwargs.get("pk")
        if filing_id:
            filing = get_return_filing_queryset().filter(pk=filing_id).first()
            if filing:
                return filing.workspace, filing.client
        client_id = request.data.get("client") or request.query_params.get("client")
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if workspace_id and not client_id:
            workspace = Workspace.objects.filter(pk=workspace_id).first()
            return workspace, None
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        compliance_period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period") or request.query_params.get("period")
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

    @action(detail=False, methods=["get"], url_path="operations")
    def operations(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset()).order_by("-updated_at")
        include_resolved = str(request.query_params.get("include_resolved", "")).lower() in {"1", "true", "yes"}
        if not include_resolved and "status" not in request.query_params:
            queryset = queryset.exclude(status__in=[ReturnFiling.FilingStatus.FILED, ReturnFiling.FilingStatus.CANCELLED])
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True, context=self.get_serializer_context())
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data, message="Filing operations queue loaded"))

    @property
    def basename_title(self):
        return "Return Filing"

    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filing, created = create_return_filing(validated_data=serializer.validated_data, user=request.user)
        output = ReturnFilingSerializer(filing, context=self.get_serializer_context())
        if not created:
            message = "Active filing already exists for this prepared return"
        elif filing.return_type == "gstr9":
            message = "Manual GSTR-9 filing record opened"
        elif filing.return_type == "gstr9c":
            message = "Manual GSTR-9C filing record opened"
        else:
            message = "Filing queued"
        return Response(api_response(data=output.data, message=message))

    @action(detail=True, methods=["get"], url_path="attempts")
    def attempts(self, request, pk=None):
        self.get_object()
        queryset = get_return_filing_attempt_queryset().filter(return_filing_id=pk).order_by("-attempt_number")
        page = self.paginate_queryset(queryset)
        serializer = ReturnFilingAttemptSerializer(page or queryset, many=True, context=self.get_serializer_context())
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["get"], url_path="events")
    def events(self, request, pk=None):
        self.get_object()
        queryset = get_return_filing_event_queryset().filter(return_filing_id=pk).order_by("created_at")
        page = self.paginate_queryset(queryset)
        serializer = ReturnFilingEventSerializer(page or queryset, many=True, context=self.get_serializer_context())
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filing = retry_return_filing(
            filing=self.get_object(),
            user=request.user,
            comments=serializer.validated_data.get("comments", ""),
        )
        output = ReturnFilingSerializer(filing, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Filing retry queued"))

    @action(detail=True, methods=["post"], url_path="requeue-after-review")
    def requeue_after_review(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filing = requeue_return_filing_after_review(
            filing=self.get_object(),
            user=request.user,
            comments=serializer.validated_data["comments"],
        )
        output = ReturnFilingSerializer(filing, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Filing requeued after review"))

    @action(detail=True, methods=["post"], url_path="resync")
    def resync(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = sync_return_filing_status(filing_id=self.get_object().id, actor_id=request.user.id)
        filing = self.get_object()
        output = ReturnFilingSerializer(filing, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Filing status resynced", sync=result))

    @action(detail=True, methods=["post"], url_path="escalate-alerts")
    def escalate_alerts(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        incident_note = escalate_return_filing_operational_alerts(
            filing=self.get_object(),
            user=request.user,
            comments=serializer.validated_data.get("comments", ""),
        )
        output = ReturnFilingIncidentNoteSerializer(incident_note, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Operational alerts escalated"))

    @action(detail=True, methods=["get", "post"], url_path="incident-notes")
    def incident_notes(self, request, pk=None):
        filing = self.get_object()
        if request.method == "POST":
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            incident_note = create_return_filing_incident_note(
                filing=filing,
                user=request.user,
                title=serializer.validated_data["title"],
                note=serializer.validated_data["note"],
                severity=serializer.validated_data["severity"],
                alert_code=serializer.validated_data.get("alert_code", ""),
            )
            output = ReturnFilingIncidentNoteSerializer(incident_note, context=self.get_serializer_context())
            return Response(api_response(data=output.data, message="Incident note created"))
        queryset = filing.incident_notes.filter(is_active=True).order_by("-created_at")
        page = self.paginate_queryset(queryset)
        serializer = ReturnFilingIncidentNoteSerializer(page or queryset, many=True, context=self.get_serializer_context())
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(api_response(data=serializer.data))

    @action(detail=True, methods=["post"], url_path="incident-notes/(?P<note_id>[^/.]+)/resolve")
    def resolve_incident_note(self, request, pk=None, note_id=None):
        filing = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        incident_note = filing.incident_notes.filter(pk=note_id, is_active=True).first()
        if incident_note is None:
            return Response(api_response(message="Incident note not found"), status=404)
        incident_note = resolve_return_filing_incident_note(filing=filing, incident_note=incident_note, user=request.user)
        output = ReturnFilingIncidentNoteSerializer(incident_note, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Incident note resolved"))


class ProviderAuthSessionViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = ["workspace", "client", "gstin", "provider", "status", "response_contract_confirmed"]
    ordering_fields = ["created_at", "updated_at", "last_requested_at", "verified_at"]

    def get_queryset(self):
        return ProviderAuthSession.objects.select_related("workspace", "client", "gstin", "initiated_by", "verified_by")

    def get_serializer_class(self):
        if self.action == "request_otp":
            return ProviderOTPRequestSerializer
        if self.action == "verify_otp":
            return ProviderOTPVerifySerializer
        if self.action == "refresh_token":
            return ProviderAuthRefreshSerializer
        return ProviderAuthSessionSerializer

    def get_permission_code(self, request):
        if self.action in {"request_otp", "verify_otp", "refresh_token"}:
            return "file_return"
        return "view_client"

    def get_permission_codes(self, request):
        if self.action in {"list", "retrieve"}:
            return ["file_return", "view_audit_log"]
        return [self.get_permission_code(request)]

    def get_throttles(self):
        if self.action == "request_otp":
            return [ProviderOTPRequestRateThrottle()]
        if self.action == "verify_otp":
            return [ProviderOTPVerifyRateThrottle()]
        return super().get_throttles()

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        session_id = self.kwargs.get("pk")
        if session_id:
            auth_session = ProviderAuthSession.objects.filter(pk=session_id).select_related("workspace", "client").first()
            if auth_session:
                return auth_session.workspace, auth_session.client
        client_id = request.data.get("client") or request.query_params.get("client")
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        return None, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Provider Auth Session"

    @action(detail=False, methods=["post"], url_path="request-otp")
    def request_otp(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        auth_session = request_provider_otp_session(validated_data=serializer.validated_data, user=request.user)
        output = ProviderAuthSessionSerializer(auth_session, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Provider OTP requested"))

    @action(detail=True, methods=["post"], url_path="verify-otp")
    def verify_otp(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        auth_session = verify_provider_otp_session(
            auth_session=self.get_object(),
            otp=serializer.validated_data["otp"],
            txn=serializer.validated_data.get("txn", ""),
            user=request.user,
        )
        output = ProviderAuthSessionSerializer(auth_session, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Provider auth token exchange completed"))

    @action(detail=True, methods=["post"], url_path="refresh-token")
    def refresh_token(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        auth_session = refresh_provider_auth_session(
            auth_session=self.get_object(),
            txn=serializer.validated_data.get("txn", ""),
            user=request.user,
        )
        output = ProviderAuthSessionSerializer(auth_session, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Provider auth session refreshed"))


class WhiteBooksAuthSessionViewSet(ProviderAuthSessionViewSet):
    @property
    def basename_title(self):
        return "WhiteBooks Auth Session"
