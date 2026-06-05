from django.conf import settings
from rest_framework import serializers

from apps.approvals.models import ApprovalRequest
from apps.clients.models import Client
from apps.common.security import sanitize_json
from apps.filings.models import ProviderAuthSession, ReturnFiling, ReturnFilingAttempt, ReturnFilingEvent, ReturnFilingIncidentNote
from apps.filings.services.auth_session_freshness import (
    get_provider_auth_session_freshness,
    is_provider_auth_session_live_enabled,
)
from apps.filings.services.alerts import build_return_filing_operational_alerts, get_alert_routing_summary
from apps.filings.services.rollout import (
    resolve_provider_rollout_policy,
    rollout_policy_allows_live_status_sync,
    rollout_policy_allows_live_submission,
)
from apps.gstins.models import GSTIN
from apps.returns.models import ReturnPreparation


def _get_latest_provider_auth_session(*, workspace_id, client_id, gstin_id, provider_code):
    return (
        ProviderAuthSession.objects.filter(
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            provider=provider_code,
            is_active=True,
        )
        .order_by("-verified_at", "-updated_at", "-created_at")
        .first()
    )


def _get_provider_auth_readiness_error(*, auth_session):
    if auth_session is None:
        return "Request OTP and verify a live filing session before starting filing."

    if auth_session.status not in {
        ProviderAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
    }:
        return "Verify OTP successfully before starting filing."

    if not is_provider_auth_session_live_enabled(auth_session=auth_session):
        return "Verify OTP and wait for the live gateway confirmation before starting filing."

    freshness = get_provider_auth_session_freshness(auth_session=auth_session)
    if freshness["is_stale"]:
        return freshness["stale_reason"] or "The filing access session is stale. Request OTP again."

    return None


def _is_auth_recoverable_queued_filing(filing):
    if filing.status != ReturnFiling.FilingStatus.QUEUED_FOR_FILING:
        return False
    if filing.submitted_at or filing.provider_reference_id or filing.provider_acknowledgement_id:
        return False
    latest_attempt = filing.attempts.order_by("-attempt_number").first()
    if latest_attempt is None:
        return False
    return latest_attempt.status in {
        ReturnFilingAttempt.AttemptStatus.CREATED,
        ReturnFilingAttempt.AttemptStatus.QUEUED,
    }


class ReturnFilingAttemptSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.SerializerMethodField()
    request_summary = serializers.SerializerMethodField()
    response_summary = serializers.SerializerMethodField()
    provider_status_raw = serializers.SerializerMethodField()

    class Meta:
        model = ReturnFilingAttempt
        fields = [
            "id",
            "attempt_number",
            "status",
            "provider_request_id",
            "idempotency_key",
            "request_payload_hash",
            "request_summary",
            "response_summary",
            "provider_status_raw",
            "failure_code",
            "failure_message",
            "started_at",
            "submitted_at",
            "completed_at",
            "triggered_by",
            "triggered_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_triggered_by_name(self, obj):
        if obj.triggered_by is None:
            return None
        full_name = obj.triggered_by.get_full_name().strip()
        return full_name or obj.triggered_by.username

    def get_request_summary(self, obj):
        return sanitize_json(obj.request_summary or {})

    def get_response_summary(self, obj):
        return sanitize_json(obj.response_summary or {})

    def get_provider_status_raw(self, obj):
        return sanitize_json(obj.provider_status_raw or {})


class ReturnFilingEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    class Meta:
        model = ReturnFilingEvent
        fields = [
            "id",
            "filing_attempt",
            "event_type",
            "old_status",
            "new_status",
            "actor",
            "actor_name",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor is None:
            return None
        full_name = obj.actor.get_full_name().strip()
        return full_name or obj.actor.username

    def get_metadata(self, obj):
        return sanitize_json(obj.metadata or {})


class ReturnFilingIncidentNoteSerializer(serializers.ModelSerializer):
    resolved_by_name = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    class Meta:
        model = ReturnFilingIncidentNote
        fields = [
            "id",
            "return_filing",
            "title",
            "note",
            "severity",
            "status",
            "alert_code",
            "metadata",
            "resolved_at",
            "resolved_by",
            "resolved_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_resolved_by_name(self, obj):
        if obj.resolved_by is None:
            return None
        full_name = obj.resolved_by.get_full_name().strip()
        return full_name or obj.resolved_by.username

    def get_metadata(self, obj):
        return sanitize_json(obj.metadata or {})


class ReturnFilingSerializer(serializers.ModelSerializer):
    INTERVENTION_EVENT_LABELS = {
        "filing.retry_requested": "retry requested",
        "filing.recovery_requeued": "requeued after review",
        "filing.status_synced": "status synced",
        "filing.offset_failed": "offset failed",
        "filing.proceed_failed": "proceed to file failed",
        "filing.file_failed": "final file failed",
        "filing.draft_save_failed": "draft save failed",
    }

    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    prepared_return_status = serializers.CharField(source="prepared_return.status", read_only=True)
    approval_request_status = serializers.CharField(source="approval_request.status", read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    filed_by_name = serializers.SerializerMethodField()
    latest_attempt = serializers.SerializerMethodField()
    recovery_actions = serializers.SerializerMethodField()
    intervention_history = serializers.SerializerMethodField()
    provider_evidence_summary = serializers.SerializerMethodField()
    support_actions_summary = serializers.SerializerMethodField()
    support_status_summary = serializers.SerializerMethodField()
    rollout_policy_summary = serializers.SerializerMethodField()
    operational_alerts = serializers.SerializerMethodField()
    alert_routing_summary = serializers.SerializerMethodField()
    incident_notes = serializers.SerializerMethodField()

    class Meta:
        model = ReturnFiling
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "prepared_return",
            "prepared_return_status",
            "prepared_snapshot_version",
            "approval_request",
            "approval_request_status",
            "provider",
            "return_type",
            "status",
            "provider_reference_id",
            "provider_acknowledgement_id",
            "arn",
            "readiness_snapshot",
            "error_summary",
            "submitted_at",
            "arn_received_at",
            "filed_at",
            "last_status_sync_at",
            "approved_by",
            "approved_by_name",
            "filed_by",
            "filed_by_name",
            "latest_attempt",
            "recovery_actions",
            "intervention_history",
            "provider_evidence_summary",
            "support_actions_summary",
            "support_status_summary",
            "rollout_policy_summary",
            "operational_alerts",
            "alert_routing_summary",
            "incident_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_approved_by_name(self, obj):
        if obj.approved_by is None:
            return None
        full_name = obj.approved_by.get_full_name().strip()
        return full_name or obj.approved_by.username

    def get_filed_by_name(self, obj):
        if obj.filed_by is None:
            return None
        full_name = obj.filed_by.get_full_name().strip()
        return full_name or obj.filed_by.username

    def get_latest_attempt(self, obj):
        latest_attempt = self._get_latest_attempt(obj)
        if latest_attempt is None:
            return None
        return ReturnFilingAttemptSerializer(latest_attempt, context=self.context).data

    def get_recovery_actions(self, obj):
        latest_attempt = self._get_latest_attempt(obj)
        response_summary = latest_attempt.response_summary if latest_attempt and isinstance(latest_attempt.response_summary, dict) else {}
        failure_summary = response_summary.get("failure_summary") if isinstance(response_summary.get("failure_summary"), dict) else {}
        next_action = str(response_summary.get("next_action") or "")
        provider_stage = str(
            response_summary.get("provider_stage")
            or (latest_attempt.request_summary.get("provider_stage") if latest_attempt and isinstance(latest_attempt.request_summary, dict) else "")
            or ""
        )
        retryable = bool(response_summary.get("retryable") or failure_summary.get("retryable"))

        recovery = {
            "can_retry": False,
            "can_resync": False,
            "recommended_action": "none",
            "reason": "",
        }

        if obj.status == ReturnFiling.FilingStatus.NEEDS_RETRY or retryable or next_action == "retry_filing":
            recovery.update(
                {
                    "can_retry": True,
                    "recommended_action": "retry_filing",
                    "reason": "The provider marked this filing as retryable after a temporary operational issue.",
                }
            )
            return recovery

        if next_action == "review_rollout_controls":
            recovery.update(
                {
                    "recommended_action": "review_rollout_controls",
                    "reason": "Tenant rollout controls currently block automated provider status sync or further live progression for this filing context.",
                }
            )
            return recovery

        if provider_stage == "file_requested" or next_action in {"resync_for_arn_or_status", "resync_before_retry"}:
            recovery.update(
                {
                    "can_resync": True,
                    "recommended_action": "resync_status",
                    "reason": "The filing is awaiting confirmed provider status or ARN and should be resynced before any replay attempt.",
                }
            )
            return recovery

        if obj.status == ReturnFiling.FilingStatus.FAILED and next_action in {"review_provider_error", "review_provider_failure"}:
            recovery.update(
                {
                    "recommended_action": "review_provider_error",
                    "reason": "The provider returned a non-retryable failure. Review the provider evidence before any manual intervention.",
                }
            )
            return recovery

        if obj.status == ReturnFiling.FilingStatus.SUBMITTED and provider_stage in {"draft_saved", "proceeded_to_file", "offset_applied"}:
            recovery.update(
                {
                    "can_resync": True,
                    "recommended_action": "resync_status",
                    "reason": "The filing has partial provider progress and should be resynced before any additional action.",
                }
            )
            return recovery

        return recovery

    def get_intervention_history(self, obj):
        events = self._get_intervention_events(obj)
        intervention_history = []
        for event in events:
            metadata = event.metadata if isinstance(event.metadata, dict) else {}
            intervention_history.append(
                {
                    "id": str(event.id),
                    "event_type": event.event_type,
                    "label": self.INTERVENTION_EVENT_LABELS.get(event.event_type, event.event_type.replace(".", " ")),
                    "new_status": event.new_status,
                    "actor_name": self._get_user_display_name(event.actor),
                    "created_at": event.created_at,
                    "note": metadata.get("comments") or metadata.get("message") or "",
                }
            )
        return intervention_history

    def get_provider_evidence_summary(self, obj):
        latest_attempt = self._get_latest_attempt(obj)
        response_summary = latest_attempt.response_summary if latest_attempt and isinstance(latest_attempt.response_summary, dict) else {}
        failure_summary = response_summary.get("failure_summary") if isinstance(response_summary.get("failure_summary"), dict) else {}

        return {
            "provider_stage": str(
                response_summary.get("provider_stage")
                or (latest_attempt.request_summary.get("provider_stage") if latest_attempt and isinstance(latest_attempt.request_summary, dict) else "")
                or ""
            ),
            "latest_message": str(response_summary.get("message") or ""),
            "next_action": str(response_summary.get("next_action") or ""),
            "auth_session_id": str(response_summary.get("auth_session_id") or ""),
            "operations_requested": [value for value in response_summary.get("operations_requested", []) if isinstance(value, str)],
            "operations_completed": [value for value in response_summary.get("operations_completed", []) if isinstance(value, str)],
            "operations_failed": [value for value in response_summary.get("operations_failed", []) if isinstance(value, str)],
            "evidence_available": {
                "save_response": isinstance(response_summary.get("save_response"), dict),
                "offset_response": isinstance(response_summary.get("offset_response"), dict),
                "proceed_response": isinstance(response_summary.get("proceed_response"), dict),
                "file_response": isinstance(response_summary.get("file_response"), dict),
                "status_response": isinstance(response_summary.get("status_response"), dict),
                "track_response": isinstance(response_summary.get("track_response"), dict),
            },
            "latest_failure": {
                "code": str(failure_summary.get("code") or latest_attempt.failure_code or ""),
                "message": str(failure_summary.get("message") or latest_attempt.failure_message or ""),
                "retryable": bool(failure_summary.get("retryable")),
            }
            if failure_summary or (latest_attempt and (latest_attempt.failure_code or latest_attempt.failure_message))
            else None,
        }

    def get_support_actions_summary(self, obj):
        recovery_actions = self.get_recovery_actions(obj)
        return {
            "recommended_action": recovery_actions["recommended_action"],
            "summary_reason": recovery_actions["reason"],
            "actions": [
                {
                    "action": "retry",
                    "label": "Retry filing",
                    "allowed": bool(recovery_actions["can_retry"]),
                    "reason": (
                        recovery_actions["reason"]
                        if recovery_actions["recommended_action"] == "retry_filing"
                        else "Retry is not currently recommended by the backend workflow."
                    ),
                },
                {
                    "action": "resync",
                    "label": "Resync status",
                    "allowed": bool(recovery_actions["can_resync"]),
                    "reason": (
                        recovery_actions["reason"]
                        if recovery_actions["recommended_action"] == "resync_status"
                        else "Resync is not currently recommended by the backend workflow."
                    ),
                },
                {
                    "action": "requeue_after_review",
                    "label": "Requeue after review",
                    "allowed": obj.status == ReturnFiling.FilingStatus.FAILED
                    and recovery_actions["recommended_action"] == "review_provider_error",
                    "reason": (
                        "Support can requeue this filing after reviewing the provider failure and recording review comments."
                        if obj.status == ReturnFiling.FilingStatus.FAILED
                        and recovery_actions["recommended_action"] == "review_provider_error"
                        else "Requeue after review is reserved for failed filings that need support-led intervention."
                    ),
                },
            ],
        }

    def get_support_status_summary(self, obj):
        provider_evidence_summary = self.get_provider_evidence_summary(obj)
        support_actions_summary = self.get_support_actions_summary(obj)
        intervention_history = self.get_intervention_history(obj)

        return {
            "filing_status": obj.status,
            "provider_stage": provider_evidence_summary["provider_stage"],
            "recommended_action": support_actions_summary["recommended_action"],
            "summary_reason": support_actions_summary["summary_reason"],
            "latest_message": provider_evidence_summary["latest_message"],
            "has_provider_failure": provider_evidence_summary["latest_failure"] is not None,
            "intervention_count": len(intervention_history),
            "evidence_flags": provider_evidence_summary["evidence_available"],
        }

    def get_rollout_policy_summary(self, obj):
        policy = resolve_provider_rollout_policy(filing=obj)
        live_submission_allowed, submission_reason = rollout_policy_allows_live_submission(filing=obj)
        live_status_sync_allowed, status_sync_reason = rollout_policy_allows_live_status_sync(filing=obj)

        scope = []
        if policy is not None:
            scope.append("workspace")
            if policy.client_id:
                scope.append("client")
            if policy.gstin_id:
                scope.append("gstin")
            if policy.return_type:
                scope.append("return_type")

        return {
            "enforced": bool(settings.FILING_ENFORCE_TENANT_ROLLOUT),
            "policy_present": policy is not None,
            "policy_scope": scope,
            "provider": obj.provider,
            "return_type": obj.return_type,
            "enable_live_submission": bool(policy.enable_live_submission) if policy is not None else False,
            "enable_live_status_sync": bool(policy.enable_live_status_sync) if policy is not None else False,
            "live_submission_allowed": bool(live_submission_allowed),
            "live_status_sync_allowed": bool(live_status_sync_allowed),
            "submission_reason": submission_reason,
            "status_sync_reason": status_sync_reason,
            "notes": str(policy.notes or "") if policy is not None else "",
            "effective_from": policy.effective_from if policy is not None else None,
            "effective_to": policy.effective_to if policy is not None else None,
        }

    def get_operational_alerts(self, obj):
        latest_attempt = self._get_latest_attempt(obj)
        return build_return_filing_operational_alerts(filing=obj, latest_attempt=latest_attempt)

    def get_alert_routing_summary(self, obj):
        alerts = self.get_operational_alerts(obj)
        return get_alert_routing_summary(filing=obj, alerts=alerts)

    def get_incident_notes(self, obj):
        notes = getattr(obj, "prefetched_incident_notes", None)
        if notes is None:
            notes = obj.incident_notes.filter(is_active=True).order_by("-created_at")
        return ReturnFilingIncidentNoteSerializer(notes[:5], many=True, context=self.context).data

    def _get_latest_attempt(self, obj):
        attempts = getattr(obj, "prefetched_attempts", None)
        return attempts[0] if attempts else obj.attempts.order_by("-attempt_number").first()

    def _get_intervention_events(self, obj):
        events = getattr(obj, "prefetched_events", None)
        if events is None:
            events = obj.events.filter(event_type__in=self.INTERVENTION_EVENT_LABELS.keys()).order_by("-created_at")
        return list(events[:5])

    def _get_user_display_name(self, user):
        if user is None:
            return None
        full_name = user.get_full_name().strip()
        return full_name or user.username


class ReturnFilingOperationsSerializer(ReturnFilingSerializer):
    class Meta(ReturnFilingSerializer.Meta):
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "prepared_return",
            "provider",
            "return_type",
            "status",
            "provider_reference_id",
            "arn",
            "last_status_sync_at",
            "support_actions_summary",
            "support_status_summary",
            "provider_evidence_summary",
            "intervention_history",
            "rollout_policy_summary",
            "operational_alerts",
            "alert_routing_summary",
            "incident_notes",
            "updated_at",
        ]
        read_only_fields = fields


class ReturnFilingStartSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    prepared_return = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices)
    provider = serializers.ChoiceField(choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    approval_request = serializers.UUIDField(required=False)
    confirmation_note = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        prepared_return = (
            ReturnPreparation.objects.select_related("compliance_period", "compliance_period__gstin", "compliance_period__gstin__client")
            .filter(pk=attrs["prepared_return"])
            .first()
        )
        if prepared_return is None:
            raise serializers.ValidationError({"prepared_return": "Prepared return not found."})
        provider_auth_session = None
        provider_auth_error = None
        if attrs["provider"] == ReturnFiling.Provider.WHITEBOOKS:
            provider_auth_session = _get_latest_provider_auth_session(
                workspace_id=attrs["workspace"],
                client_id=attrs["client"],
                gstin_id=attrs["gstin"],
                provider_code=attrs["provider"],
            )
            provider_auth_error = _get_provider_auth_readiness_error(auth_session=provider_auth_session)
        existing_filing = ReturnFiling.objects.filter(
            prepared_return=prepared_return,
            prepared_snapshot_version=1,
            is_active=True,
        ).first()
        if existing_filing is not None:
            if _is_auth_recoverable_queued_filing(existing_filing):
                if provider_auth_error:
                    raise serializers.ValidationError(
                        {
                            "provider_auth": (
                                "This return already has an earlier queued filing attempt from before OTP verification was completed. "
                                "Request a fresh OTP for this GSTIN, verify it, then click Resume filing. "
                                "A verified filing session stays active for up to 6 hours. "
                                f"{provider_auth_error}"
                            )
                        }
                    )
                attrs["restart_existing_filing"] = existing_filing
            else:
                attrs["existing_filing"] = existing_filing
            attrs["prepared_return_instance"] = prepared_return
            attrs["provider_auth_session_instance"] = provider_auth_session
            return attrs
        if prepared_return.status != ReturnPreparation.PreparationStatus.APPROVED:
            raise serializers.ValidationError({"prepared_return": "Prepared return must be approved before filing."})
        if str(prepared_return.compliance_period_id) != str(attrs["compliance_period"]):
            raise serializers.ValidationError({"compliance_period": "Prepared return does not belong to this compliance period."})
        if str(prepared_return.compliance_period.gstin_id) != str(attrs["gstin"]):
            raise serializers.ValidationError({"gstin": "Prepared return does not belong to this GSTIN."})
        if str(prepared_return.compliance_period.gstin.client_id) != str(attrs["client"]):
            raise serializers.ValidationError({"client": "Prepared return does not belong to this client."})
        if str(prepared_return.compliance_period.gstin.client.workspace_id) != str(attrs["workspace"]):
            raise serializers.ValidationError({"workspace": "Prepared return does not belong to this workspace."})
        if prepared_return.return_type != attrs["return_type"]:
            raise serializers.ValidationError({"return_type": "Prepared return type does not match filing request."})
        if provider_auth_error:
            raise serializers.ValidationError({"provider_auth": provider_auth_error})

        approval_request_id = attrs.get("approval_request")
        if approval_request_id:
            approval_request = ApprovalRequest.objects.filter(pk=approval_request_id).first()
            if approval_request is None:
                raise serializers.ValidationError({"approval_request": "Approval request not found."})
            if approval_request.status != ApprovalRequest.ApprovalStatus.APPROVED:
                raise serializers.ValidationError({"approval_request": "Approval request must be approved before filing."})
            if approval_request.entity_type != ApprovalRequest.EntityType.RETURN_PREPARATION:
                raise serializers.ValidationError({"approval_request": "Approval request must be for a return preparation."})
            if str(approval_request.entity_id) != str(prepared_return.id):
                raise serializers.ValidationError({"approval_request": "Approval request does not match the prepared return."})
            attrs["approval_request_instance"] = approval_request

        attrs["prepared_return_instance"] = prepared_return
        attrs["provider_auth_session_instance"] = provider_auth_session
        return attrs


class ReturnFilingActionSerializer(serializers.Serializer):
    comments = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ReturnFilingRecoverySerializer(serializers.Serializer):
    comments = serializers.CharField(required=True, allow_blank=False, max_length=500)


class ReturnFilingAlertEscalationSerializer(serializers.Serializer):
    comments = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class ReturnFilingIncidentNoteCreateSerializer(serializers.Serializer):
    title = serializers.CharField(required=True, allow_blank=False, max_length=160)
    note = serializers.CharField(required=True, allow_blank=False, max_length=4000)
    severity = serializers.ChoiceField(choices=ReturnFilingIncidentNote.Severity.choices, default=ReturnFilingIncidentNote.Severity.WARNING)
    alert_code = serializers.CharField(required=False, allow_blank=True, max_length=64)


class ReturnFilingIncidentNoteResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ReturnFilingIncidentNote.Status.choices)


class ProviderAuthSessionSerializer(serializers.ModelSerializer):
    response_contract_confirmed = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    initiated_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    otp_request_payload = serializers.SerializerMethodField()
    auth_token_payload = serializers.SerializerMethodField()
    session_metadata = serializers.SerializerMethodField()
    freshness_summary = serializers.SerializerMethodField()

    class Meta:
        model = ProviderAuthSession
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "provider",
            "email",
            "txn",
            "status",
            "otp_request_payload",
            "auth_token_payload",
            "session_metadata",
            "freshness_summary",
            "error_summary",
            "response_contract_confirmed",
            "last_requested_at",
            "verified_at",
            "initiated_by",
            "initiated_by_name",
            "verified_by",
            "verified_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_initiated_by_name(self, obj):
        if obj.initiated_by is None:
            return None
        full_name = obj.initiated_by.get_full_name().strip()
        return full_name or obj.initiated_by.username

    def get_verified_by_name(self, obj):
        if obj.verified_by is None:
            return None
        full_name = obj.verified_by.get_full_name().strip()
        return full_name or obj.verified_by.username

    def get_otp_request_payload(self, obj):
        payload = obj.otp_request_payload if isinstance(obj.otp_request_payload, dict) else {}
        return {
            "available": bool(payload),
            "status_cd": str(payload.get("status_cd") or ""),
            "status_desc": str(payload.get("status_desc") or payload.get("message") or ""),
        }

    def get_auth_token_payload(self, obj):
        payload = obj.auth_token_payload if isinstance(obj.auth_token_payload, dict) else {}
        return {
            "available": bool(payload),
            "status_cd": str(payload.get("status_cd") or ""),
            "status_desc": str(payload.get("status_desc") or payload.get("message") or ""),
            "response_contract_confirmed": is_provider_auth_session_live_enabled(auth_session=obj),
        }

    def get_session_metadata(self, obj):
        payload = obj.session_metadata if isinstance(obj.session_metadata, dict) else {}
        return {
            "available": bool(payload),
            "session_credentials_present": bool(payload.get("session_credentials_present")),
            "resolution_status": str(payload.get("resolution_status") or ""),
            "response_contract_confirmed": is_provider_auth_session_live_enabled(auth_session=obj),
        }

    def get_response_contract_confirmed(self, obj):
        return is_provider_auth_session_live_enabled(auth_session=obj)

    def get_freshness_summary(self, obj):
        freshness = get_provider_auth_session_freshness(auth_session=obj)
        return {
            "max_age_minutes": freshness["max_age_minutes"],
            "verified_at": freshness["verified_at"],
            "expires_at": freshness["expires_at"],
            "is_stale": freshness["is_stale"],
            "stale_reason": freshness["stale_reason"],
        }


class ProviderOTPRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField(required=False, allow_null=True)
    provider = serializers.ChoiceField(choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    email = serializers.EmailField(required=False)

    def validate(self, attrs):
        client = Client.objects.filter(pk=attrs["client"]).select_related("workspace").first()
        if client is None:
            raise serializers.ValidationError({"client": "Client not found."})
        if str(client.workspace_id) != str(attrs["workspace"]):
            raise serializers.ValidationError({"workspace": "Client does not belong to this workspace."})

        gstin_id = attrs.get("gstin")
        gstin = None
        if gstin_id:
            gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client").first()
            if gstin is None:
                raise serializers.ValidationError({"gstin": "GSTIN not found."})
            if str(gstin.client_id) != str(client.id):
                raise serializers.ValidationError({"gstin": "GSTIN does not belong to this client."})

        attrs["client_instance"] = client
        attrs["gstin_instance"] = gstin
        if attrs.get("provider") == ReturnFiling.Provider.WHITEBOOKS:
            attrs["email"] = settings.WHITEBOOKS_CONTACT_EMAIL
        else:
            attrs["email"] = attrs.get("email") or settings.WHITEBOOKS_CONTACT_EMAIL
        if not attrs["email"]:
            raise serializers.ValidationError({"email": "Provider contact email is required."})
        return attrs


class ProviderOTPVerifySerializer(serializers.Serializer):
    otp = serializers.CharField(max_length=16)
    txn = serializers.CharField(required=False, allow_blank=True, max_length=128)


# Compatibility aliases for the existing WhiteBooks-named API surface.
WhiteBooksAuthSessionSerializer = ProviderAuthSessionSerializer
WhiteBooksOTPRequestSerializer = ProviderOTPRequestSerializer
WhiteBooksOTPVerifySerializer = ProviderOTPVerifySerializer
