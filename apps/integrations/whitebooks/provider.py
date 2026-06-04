from django.conf import settings

from apps.filings.providers.base import FilingProvider, ProviderCapabilitySet, ProviderStageDefinition
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.rollout import (
    rollout_policy_allows_live_status_sync,
    rollout_policy_allows_live_submission,
)
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import (
    WhiteBooksConfigurationError,
    WhiteBooksStepError,
    WhiteBooksSubmissionError,
    WhiteBooksTemporaryError,
)
from apps.integrations.whitebooks.mappers import map_return_filing_to_whitebooks_payload
from apps.integrations.whitebooks.types import WhiteBooksSession, WhiteBooksSubmissionResult


class WhiteBooksProvider(FilingProvider):
    provider_code = ReturnFiling.Provider.WHITEBOOKS
    stage_definitions = {
        "draft_saved": ProviderStageDefinition(
            stage="draft_saved",
            requested_event_type="filing.draft_save_requested",
            requested_audit_action="return_filing.draft_save_requested",
            completed_event_type="filing.draft_saved",
            completed_audit_action="return_filing.draft_saved",
            failed_event_type="filing.draft_save_failed",
            failed_audit_action="return_filing.draft_save_failed",
        ),
        "proceeded_to_file": ProviderStageDefinition(
            stage="proceeded_to_file",
            requested_event_type="filing.proceed_requested",
            requested_audit_action="return_filing.proceed_requested",
            completed_event_type="filing.proceeded_to_file",
            completed_audit_action="return_filing.proceeded_to_file",
            failed_event_type="filing.proceed_failed",
            failed_audit_action="return_filing.proceed_failed",
        ),
        "offset_applied": ProviderStageDefinition(
            stage="offset_applied",
            requested_event_type="filing.offset_requested",
            requested_audit_action="return_filing.offset_requested",
            completed_event_type="filing.offset_applied",
            completed_audit_action="return_filing.offset_applied",
            failed_event_type="filing.offset_failed",
            failed_audit_action="return_filing.offset_failed",
        ),
        "file_requested": ProviderStageDefinition(
            stage="file_requested",
            requested_event_type="filing.file_requested",
            requested_audit_action="return_filing.file_requested",
            completed_event_type="filing.file_submitted",
            completed_audit_action="return_filing.file_submitted",
            failed_event_type="filing.file_failed",
            failed_audit_action="return_filing.file_failed",
        ),
    }

    def __init__(self):
        self.client = WhiteBooksClient()

    def prepare_payload(self, filing: ReturnFiling) -> dict:
        return map_return_filing_to_whitebooks_payload(filing)

    def authenticate(self) -> WhiteBooksSession:
        return self.client.authenticate()

    def request_otp(self, *, email: str, state_code: str | None = None, gst_username: str | None = None) -> dict:
        return self.client.request_otp(email=email, state_code=state_code, gst_username=gst_username)

    def exchange_otp_for_session(
        self,
        *,
        email: str,
        otp: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> WhiteBooksSession:
        return self.client.exchange_otp_for_session(
            email=email,
            otp=otp,
            txn=txn,
            state_code=state_code,
            gst_username=gst_username,
        )

    def get_capabilities(self, filing=None, payload=None) -> ProviderCapabilitySet:
        operations = {}
        readiness = {}
        return_type = getattr(filing, "return_type", "")
        if isinstance(payload, dict):
            whitebooks_payload = payload.get("whitebooks", {})
            if isinstance(whitebooks_payload, dict):
                operations = whitebooks_payload.get("operations", {}) if isinstance(whitebooks_payload.get("operations"), dict) else {}
                readiness = whitebooks_payload.get("readiness", {}) if isinstance(whitebooks_payload.get("readiness"), dict) else {}

        live_gstr1_save_enabled = (
            not self.client.sandbox_mode
            and return_type == "gstr1"
            and settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE
            and bool(readiness.get("save_supported", True))
            and bool(operations.get("save") or not payload)
        )
        live_gstr3b_save_enabled = (
            not self.client.sandbox_mode
            and return_type == "gstr3b"
            and settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE
            and bool(readiness.get("save_supported", True))
            and bool(operations.get("save") or not payload)
        )
        live_proceed_enabled = (
            live_gstr1_save_enabled
            and settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE
            and bool(operations.get("proceed") or not payload)
        )
        live_gstr3b_offset_enabled = (
            live_gstr3b_save_enabled
            and return_type == "gstr3b"
            and settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE
            and bool(readiness.get("offset_supported", False))
            and bool(operations.get("offset") or not payload)
        )
        live_file_enabled = (
            live_proceed_enabled
            and settings.WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE
            and bool(operations.get("file") or not payload)
        )
        live_gstr3b_file_enabled = (
            live_gstr3b_offset_enabled
            and return_type == "gstr3b"
            and settings.WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE
            and bool(readiness.get("file_supported", False))
            and bool(operations.get("file") or not payload)
        )
        live_save_enabled = live_gstr1_save_enabled or live_gstr3b_save_enabled
        save_supported = bool(readiness.get("save_supported", return_type in {"gstr1", "gstr3b"}))
        proceed_supported = (
            return_type == "gstr1"
            and settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE
            and bool(operations.get("proceed") or not payload)
        )
        file_supported = (
            bool(readiness.get("file_supported", return_type == "gstr1")) and live_file_enabled
            if return_type == "gstr1"
            else bool(readiness.get("file_supported", False)) and live_gstr3b_file_enabled
        )
        offset_supported = bool(readiness.get("offset_supported", False)) and live_gstr3b_offset_enabled
        rollout_enabled = True
        rollout_reason = ""
        live_status_sync_enabled = False
        if filing is not None and not self.client.sandbox_mode:
            rollout_enabled, rollout_reason = rollout_policy_allows_live_submission(filing=filing)
            live_status_sync_enabled, _ = rollout_policy_allows_live_status_sync(filing=filing)

        if not rollout_enabled:
            live_save_enabled = False
            proceed_supported = False
            file_supported = False
            offset_supported = False

        return ProviderCapabilitySet(
            sandbox_mode=self.client.sandbox_mode,
            auth_session_required=not self.client.sandbox_mode,
            live_submission_enabled=live_save_enabled,
            live_status_sync_enabled=live_status_sync_enabled,
            supported_operations={
                "save": save_supported,
                "proceed": proceed_supported,
                "file": file_supported,
                "offset": offset_supported,
            },
            rollout_enabled=rollout_enabled,
            rollout_reason=rollout_reason,
        )

    def planned_submission_stage(self, filing: ReturnFiling) -> str:
        payload = self.prepare_payload(filing)
        capabilities = self.get_capabilities(filing=filing, payload=payload)
        if capabilities.live_submission_enabled:
            if capabilities.supported_operations.get("file"):
                return "file_requested"
            if capabilities.supported_operations.get("offset"):
                return "offset_applied"
            if capabilities.supported_operations.get("proceed"):
                return "proceeded_to_file"
            return "draft_saved"
        return "submitted"

    def requested_stages_for(self, planned_stage: str, filing=None) -> list[str]:
        if planned_stage == "file_requested":
            if getattr(filing, "return_type", "") == "gstr3b":
                return ["draft_saved", "offset_applied", "file_requested"]
            return ["draft_saved", "proceeded_to_file", "file_requested"]
        if planned_stage == "offset_applied":
            return ["draft_saved", "offset_applied"]
        if planned_stage == "proceeded_to_file":
            return ["draft_saved", "proceeded_to_file"]
        return super().requested_stages_for(planned_stage, filing=filing)

    def submit_return(self, filing: ReturnFiling) -> tuple[dict, WhiteBooksSubmissionResult]:
        payload = self.prepare_payload(filing)
        capabilities = self.get_capabilities(filing=filing, payload=payload)
        if not capabilities.sandbox_mode:
            result = self._submit_live_return(filing=filing, payload=payload)
        else:
            result = self.client.submit_return(payload)
        if not result.provider_reference_id:
            raise WhiteBooksSubmissionError("WhiteBooks did not return a provider reference id.")
        return payload, result

    def get_status(self, filing: ReturnFiling) -> dict:
        capabilities = self.get_capabilities(filing=filing)
        if not capabilities.sandbox_mode:
            latest_attempt = filing.attempts.order_by("-attempt_number").first()
            provider_stage = ""
            operations_completed = []
            next_action = ""
            if latest_attempt:
                response_summary = latest_attempt.response_summary if isinstance(latest_attempt.response_summary, dict) else {}
                request_summary = latest_attempt.request_summary if isinstance(latest_attempt.request_summary, dict) else {}
                provider_stage = response_summary.get("provider_stage") or request_summary.get("provider_stage") or ""
                if isinstance(response_summary.get("operations_completed"), list):
                    operations_completed = [stage for stage in response_summary["operations_completed"] if isinstance(stage, str)]
                next_action = str(response_summary.get("next_action") or "")
            if provider_stage == "file_requested" and capabilities.live_status_sync_enabled:
                live_status = self._get_live_file_status(
                    filing=filing,
                    provider_stage=provider_stage or "file_requested",
                    operations_completed=operations_completed,
                    next_action=next_action,
                )
                if live_status is not None:
                    return live_status
                message = "Live WhiteBooks final filing request was submitted. Await ARN/status confirmation before treating this as filed."
                next_action = next_action or "resync_for_arn_or_status"
            elif provider_stage == "file_requested" and not capabilities.live_status_sync_enabled:
                message = capabilities.rollout_reason or "Live provider status sync is blocked by tenant rollout policy."
                next_action = "review_rollout_controls"
            elif provider_stage == "proceeded_to_file":
                message = "Live WhiteBooks proceed-to-file status polling is not implemented yet."
                next_action = next_action or "await_final_filing_automation"
            elif provider_stage == "offset_applied":
                message = "Live WhiteBooks GSTR-3B offset completed. Final filing is not automated yet."
                next_action = next_action or "await_gstr3b_final_filing_automation"
            else:
                provider_stage = provider_stage or "draft_saved"
                message = "Live WhiteBooks status polling is not implemented yet."
                next_action = next_action or "review_draft_save_or_continue_manually"
            return {
                "provider_reference_id": filing.provider_reference_id,
                "submission_state": filing.status,
                "arn": filing.arn,
                "raw_response": {
                    "mode": "live",
                    "provider_stage": provider_stage,
                    "message": message,
                    "operations_completed": operations_completed,
                    "next_action": next_action,
                },
            }
        if filing.status == ReturnFiling.FilingStatus.SUBMITTED:
            return {
                "provider_reference_id": filing.provider_reference_id,
                "submission_state": "filed",
                "arn": f"ARN-{str(filing.id)[:12].upper()}",
                "raw_response": {
                    "mode": "sandbox",
                    "message": "Sandbox filing marked filed.",
                },
            }
        return {
            "provider_reference_id": filing.provider_reference_id,
            "submission_state": filing.status,
            "arn": filing.arn,
            "raw_response": {},
        }

    def _submit_live_return(self, *, filing: ReturnFiling, payload: dict) -> WhiteBooksSubmissionResult:
        self._validate_live_save_config(filing.return_type)
        capabilities = self.get_capabilities(filing=filing, payload=payload)
        auth_session = self._get_latest_auth_session(filing)
        if not capabilities.live_submission_enabled:
            if not capabilities.rollout_enabled and capabilities.rollout_reason:
                raise WhiteBooksSubmissionError(capabilities.rollout_reason)
            raise WhiteBooksSubmissionError(
                f"Live WhiteBooks {self._get_return_type_display(filing.return_type)} save flow is disabled by configuration."
            )

        whitebooks_payload = payload.get("whitebooks", {})
        readiness = whitebooks_payload.get("readiness", {})
        if not readiness.get("save_supported"):
            raise WhiteBooksSubmissionError("This filing does not have a WhiteBooks save payload available.")

        operations = whitebooks_payload.get("operations", {})
        save_payload = operations.get("save")
        if not save_payload:
            raise WhiteBooksSubmissionError("WhiteBooks save payload is missing for this filing.")

        if filing.return_type == "gstr1":
            live_response = self.client.save_gstr1_return(
                email=auth_session.email,
                gstin=payload.get("gstin", ""),
                ret_period=payload.get("whitebooks_ret_period", ""),
                txn=auth_session.txn,
                payload=save_payload,
            )
        elif filing.return_type == "gstr3b":
            live_response = self.client.save_gstr3b_return(
                email=auth_session.email,
                gstin=payload.get("gstin", ""),
                ret_period=payload.get("whitebooks_ret_period", ""),
                txn=auth_session.txn,
                payload=save_payload,
            )
        else:
            raise WhiteBooksSubmissionError(
                f"Live WhiteBooks transport is not available for return type {self._get_return_type_display(filing.return_type)}."
            )
        sanitized_response = self.client.sanitize_response_payload(live_response)
        if filing.return_type == "gstr3b":
            if capabilities.supported_operations.get("offset"):
                offset_payload = operations.get("offset")
                if not offset_payload:
                    raise WhiteBooksSubmissionError("WhiteBooks offset payload is missing for this filing.")
                try:
                    offset_response = self.client.offset_gstr3b_liability(
                        email=auth_session.email,
                        gstin=payload.get("gstin", ""),
                        ret_period=payload.get("whitebooks_ret_period", ""),
                        txn=auth_session.txn,
                        payload=offset_payload,
                    )
                except WhiteBooksTemporaryError as exc:
                    raise WhiteBooksStepError(
                        str(exc),
                        provider_stage="offset_applied",
                        partial_response={
                            "mode": "live_gstr3b_save_and_offset",
                            "provider_stage": "draft_saved",
                            "message": "WhiteBooks GSTR-3B draft save completed, but liability offset hit a temporary error.",
                            "auth_session_id": str(auth_session.id),
                            "save_response": sanitized_response,
                            "operations_requested": ["save", "offset"],
                            "operations_completed": ["draft_saved"],
                            "operations_failed": ["offset"],
                            "operation_outcomes": {
                                "save": {"status": "completed", "retryable": False},
                                "offset": {
                                    "status": "failed",
                                    "retryable": True,
                                    "code": "whitebooks_offset_temporary_error",
                                    "message": str(exc),
                                },
                            },
                            "failed_operation": "offset",
                            "next_action": "retry_filing",
                        },
                        completed_stages=["draft_saved"],
                        provider_reference_id=auth_session.txn,
                        retryable=True,
                        error_code="whitebooks_offset_temporary_error",
                    ) from exc
                except WhiteBooksSubmissionError as exc:
                    raise WhiteBooksStepError(
                        str(exc),
                        provider_stage="offset_applied",
                        partial_response={
                            "mode": "live_gstr3b_save_and_offset",
                            "provider_stage": "draft_saved",
                            "message": "WhiteBooks GSTR-3B draft save completed, but liability offset was rejected.",
                            "auth_session_id": str(auth_session.id),
                            "save_response": sanitized_response,
                            "operations_requested": ["save", "offset"],
                            "operations_completed": ["draft_saved"],
                            "operations_failed": ["offset"],
                            "operation_outcomes": {
                                "save": {"status": "completed", "retryable": False},
                                "offset": {
                                    "status": "failed",
                                    "retryable": False,
                                    "code": "whitebooks_offset_rejected",
                                    "message": str(exc),
                                },
                            },
                            "failed_operation": "offset",
                            "next_action": "review_provider_error",
                        },
                        completed_stages=["draft_saved"],
                        provider_reference_id=auth_session.txn,
                        retryable=False,
                        error_code="whitebooks_offset_rejected",
                    ) from exc

                sanitized_offset_response = self.client.sanitize_response_payload(offset_response)
                if capabilities.supported_operations.get("file"):
                    file_payload = operations.get("file")
                    if not file_payload:
                        raise WhiteBooksSubmissionError("WhiteBooks final filing payload is missing for this filing.")
                    try:
                        file_response = self.client.file_gstr3b_return(
                            email=auth_session.email,
                            pan=payload.get("whitebooks", {}).get("pan", ""),
                            gstin=payload.get("gstin", ""),
                            ret_period=payload.get("whitebooks_ret_period", ""),
                            txn=auth_session.txn,
                            payload=file_payload,
                        )
                    except WhiteBooksTemporaryError as exc:
                        raise WhiteBooksStepError(
                            str(exc),
                            provider_stage="file_requested",
                            partial_response={
                                "mode": "live_gstr3b_save_offset_and_file",
                                "provider_stage": "offset_applied",
                                "message": "WhiteBooks GSTR-3B draft save and offset succeeded, but the final file request hit a temporary transport issue. Resync before retrying.",
                                "auth_session_id": str(auth_session.id),
                                "save_response": sanitized_response,
                                "offset_response": sanitized_offset_response,
                                "operations_requested": ["save", "offset", "file"],
                                "operations_completed": ["draft_saved", "offset_applied"],
                                "operations_failed": ["file"],
                                "operation_outcomes": {
                                    "save": {"status": "completed", "retryable": False},
                                    "offset": {"status": "completed", "retryable": False},
                                    "file": {
                                        "status": "uncertain",
                                        "retryable": False,
                                        "code": "whitebooks_gstr3b_file_transport_uncertain",
                                        "message": str(exc),
                                    },
                                },
                                "failed_operation": "file",
                                "next_action": "resync_before_retry",
                            },
                            completed_stages=["draft_saved", "offset_applied"],
                            provider_reference_id=auth_session.txn,
                            retryable=False,
                            error_code="whitebooks_gstr3b_file_transport_uncertain",
                        ) from exc
                    except WhiteBooksSubmissionError as exc:
                        raise WhiteBooksStepError(
                            str(exc),
                            provider_stage="file_requested",
                            partial_response={
                                "mode": "live_gstr3b_save_offset_and_file",
                                "provider_stage": "offset_applied",
                                "message": "WhiteBooks GSTR-3B draft save and offset succeeded, but the final file request was rejected.",
                                "auth_session_id": str(auth_session.id),
                                "save_response": sanitized_response,
                                "offset_response": sanitized_offset_response,
                                "operations_requested": ["save", "offset", "file"],
                                "operations_completed": ["draft_saved", "offset_applied"],
                                "operations_failed": ["file"],
                                "operation_outcomes": {
                                    "save": {"status": "completed", "retryable": False},
                                    "offset": {"status": "completed", "retryable": False},
                                    "file": {
                                        "status": "failed",
                                        "retryable": False,
                                        "code": "whitebooks_gstr3b_file_rejected",
                                        "message": str(exc),
                                    },
                                },
                                "failed_operation": "file",
                                "next_action": "review_provider_error",
                            },
                            completed_stages=["draft_saved", "offset_applied"],
                            provider_reference_id=auth_session.txn,
                            retryable=False,
                            error_code="whitebooks_gstr3b_file_rejected",
                        ) from exc

                    sanitized_file_response = self.client.sanitize_response_payload(file_response)
                    provider_reference_id = str(file_response.get("ref_id") or file_response.get("reference_id") or auth_session.txn)
                    provider_acknowledgement_id = str(file_response.get("ack_id") or file_response.get("acknowledgement_id") or "")
                    return WhiteBooksSubmissionResult(
                        provider_reference_id=provider_reference_id,
                        provider_acknowledgement_id=provider_acknowledgement_id,
                        submission_state="submitted",
                        provider_stage="file_requested",
                        raw_response={
                            "mode": "live_gstr3b_save_offset_and_file",
                            "provider_stage": "file_requested",
                            "message": "WhiteBooks GSTR-3B draft save, liability offset, and final filing request completed. Await ARN/status confirmation before treating this as filed.",
                            "auth_session_id": str(auth_session.id),
                            "save_response": sanitized_response,
                            "offset_response": sanitized_offset_response,
                            "file_response": sanitized_file_response,
                            "operations_requested": ["save", "offset", "file"],
                            "operations_completed": ["draft_saved", "offset_applied", "file_requested"],
                            "operations_failed": [],
                            "operation_outcomes": {
                                "save": {"status": "completed", "retryable": False},
                                "offset": {"status": "completed", "retryable": False},
                                "file": {"status": "submitted", "retryable": False},
                            },
                            "next_action": "resync_for_arn_or_status",
                        },
                    )
                return WhiteBooksSubmissionResult(
                    provider_reference_id=auth_session.txn,
                    provider_acknowledgement_id="",
                    submission_state="submitted",
                    provider_stage="offset_applied",
                    raw_response={
                        "mode": "live_gstr3b_save_and_offset",
                        "provider_stage": "offset_applied",
                        "message": "WhiteBooks GSTR-3B draft save and liability offset completed. Final filing is still not automated.",
                        "auth_session_id": str(auth_session.id),
                        "save_response": sanitized_response,
                        "offset_response": sanitized_offset_response,
                        "operations_requested": ["save", "offset"],
                        "operations_completed": ["draft_saved", "offset_applied"],
                        "operations_failed": [],
                        "operation_outcomes": {
                            "save": {"status": "completed", "retryable": False},
                            "offset": {"status": "completed", "retryable": False},
                        },
                        "next_action": "await_gstr3b_final_filing_automation",
                    },
                )
            return WhiteBooksSubmissionResult(
                provider_reference_id=auth_session.txn,
                provider_acknowledgement_id="",
                submission_state="submitted",
                provider_stage="draft_saved",
                raw_response={
                    "mode": "live_gstr3b_save",
                    "provider_stage": "draft_saved",
                    "message": "WhiteBooks GSTR-3B draft save completed. Offset and final filing are still not automated.",
                    "auth_session_id": str(auth_session.id),
                    "save_response": sanitized_response,
                    "operations_requested": ["save"],
                    "operations_completed": ["draft_saved"],
                    "operations_failed": [],
                    "operation_outcomes": {
                        "save": {"status": "completed", "retryable": False},
                    },
                    "next_action": "await_offset_automation",
                },
            )
        if capabilities.supported_operations.get("proceed"):
            proceed_payload = operations.get("proceed")
            if not proceed_payload:
                raise WhiteBooksSubmissionError("WhiteBooks proceed-to-file payload is missing for this filing.")
            try:
                proceed_response = self.client.proceed_gstr1_filing(
                    email=auth_session.email,
                    gstin=payload.get("gstin", ""),
                    retperiod=payload.get("whitebooks_ret_period", ""),
                    txn=auth_session.txn,
                    is_nil=proceed_payload.get("isNil", "N"),
                )
            except WhiteBooksTemporaryError as exc:
                raise WhiteBooksStepError(
                    str(exc),
                    provider_stage="proceeded_to_file",
                    partial_response={
                        "mode": "live_gstr1_save_and_proceed",
                        "provider_stage": "draft_saved",
                        "message": "WhiteBooks GSTR-1 draft save completed, but proceed-to-file hit a temporary error.",
                        "auth_session_id": str(auth_session.id),
                        "save_response": sanitized_response,
                        "operations_requested": ["save", "proceed"],
                        "operations_completed": ["draft_saved"],
                        "operations_failed": ["proceed"],
                        "operation_outcomes": {
                            "save": {"status": "completed", "retryable": False},
                            "proceed": {
                                "status": "failed",
                                "retryable": True,
                                "code": "whitebooks_proceed_temporary_error",
                                "message": str(exc),
                            },
                        },
                        "failed_operation": "proceed",
                        "next_action": "retry_filing",
                    },
                    completed_stages=["draft_saved"],
                    provider_reference_id=auth_session.txn,
                    retryable=True,
                    error_code="whitebooks_proceed_temporary_error",
                ) from exc
            except WhiteBooksSubmissionError as exc:
                raise WhiteBooksStepError(
                    str(exc),
                    provider_stage="proceeded_to_file",
                    partial_response={
                        "mode": "live_gstr1_save_and_proceed",
                        "provider_stage": "draft_saved",
                        "message": "WhiteBooks GSTR-1 draft save completed, but proceed-to-file failed.",
                        "auth_session_id": str(auth_session.id),
                        "save_response": sanitized_response,
                        "operations_requested": ["save", "proceed"],
                        "operations_completed": ["draft_saved"],
                        "operations_failed": ["proceed"],
                        "operation_outcomes": {
                            "save": {"status": "completed", "retryable": False},
                            "proceed": {
                                "status": "failed",
                                "retryable": False,
                                "code": "whitebooks_proceed_rejected",
                                "message": str(exc),
                            },
                        },
                        "failed_operation": "proceed",
                        "next_action": "review_provider_error",
                    },
                    completed_stages=["draft_saved"],
                    provider_reference_id=auth_session.txn,
                    retryable=False,
                    error_code="whitebooks_proceed_rejected",
                ) from exc
            sanitized_proceed_response = self.client.sanitize_response_payload(proceed_response)
            if capabilities.supported_operations.get("file"):
                file_payload = operations.get("file")
                if not file_payload:
                    raise WhiteBooksSubmissionError("WhiteBooks final filing payload is missing for this filing.")
                try:
                    file_response = self.client.file_gstr1_return(
                        email=auth_session.email,
                        pan=payload.get("whitebooks", {}).get("pan", ""),
                        gstin=payload.get("gstin", ""),
                        ret_period=payload.get("whitebooks_ret_period", ""),
                        txn=auth_session.txn,
                        payload=file_payload,
                    )
                except WhiteBooksTemporaryError as exc:
                    raise WhiteBooksStepError(
                        str(exc),
                        provider_stage="file_requested",
                        partial_response={
                            "mode": "live_gstr1_save_proceed_and_file",
                            "provider_stage": "proceeded_to_file",
                            "message": "WhiteBooks draft save and proceed succeeded, but the final file request hit a temporary transport issue. Resync before retrying.",
                            "auth_session_id": str(auth_session.id),
                            "save_response": sanitized_response,
                            "proceed_response": sanitized_proceed_response,
                            "operations_requested": ["save", "proceed", "file"],
                            "operations_completed": ["draft_saved", "proceeded_to_file"],
                            "operations_failed": ["file"],
                            "operation_outcomes": {
                                "save": {"status": "completed", "retryable": False},
                                "proceed": {"status": "completed", "retryable": False},
                                "file": {
                                    "status": "uncertain",
                                    "retryable": False,
                                    "code": "whitebooks_file_transport_uncertain",
                                    "message": str(exc),
                                },
                            },
                            "failed_operation": "file",
                            "next_action": "resync_before_retry",
                        },
                        completed_stages=["draft_saved", "proceeded_to_file"],
                        provider_reference_id=auth_session.txn,
                        retryable=False,
                        error_code="whitebooks_file_transport_uncertain",
                    ) from exc
                except WhiteBooksSubmissionError as exc:
                    raise WhiteBooksStepError(
                        str(exc),
                        provider_stage="file_requested",
                        partial_response={
                            "mode": "live_gstr1_save_proceed_and_file",
                            "provider_stage": "proceeded_to_file",
                            "message": "WhiteBooks draft save and proceed succeeded, but the final file request was rejected.",
                            "auth_session_id": str(auth_session.id),
                            "save_response": sanitized_response,
                            "proceed_response": sanitized_proceed_response,
                            "operations_requested": ["save", "proceed", "file"],
                            "operations_completed": ["draft_saved", "proceeded_to_file"],
                            "operations_failed": ["file"],
                            "operation_outcomes": {
                                "save": {"status": "completed", "retryable": False},
                                "proceed": {"status": "completed", "retryable": False},
                                "file": {
                                    "status": "failed",
                                    "retryable": False,
                                    "code": "whitebooks_file_rejected",
                                    "message": str(exc),
                                },
                            },
                            "failed_operation": "file",
                            "next_action": "review_provider_error",
                        },
                        completed_stages=["draft_saved", "proceeded_to_file"],
                        provider_reference_id=auth_session.txn,
                        retryable=False,
                        error_code="whitebooks_file_rejected",
                    ) from exc

                sanitized_file_response = self.client.sanitize_response_payload(file_response)
                provider_reference_id = str(file_response.get("ref_id") or file_response.get("reference_id") or auth_session.txn)
                provider_acknowledgement_id = str(file_response.get("ack_id") or file_response.get("acknowledgement_id") or "")
                return WhiteBooksSubmissionResult(
                    provider_reference_id=provider_reference_id,
                    provider_acknowledgement_id=provider_acknowledgement_id,
                    submission_state="submitted",
                    provider_stage="file_requested",
                    raw_response={
                        "mode": "live_gstr1_save_proceed_and_file",
                        "provider_stage": "file_requested",
                        "message": "WhiteBooks draft save, proceed-to-file, and final filing request completed. Await ARN/status confirmation before treating this as filed.",
                        "auth_session_id": str(auth_session.id),
                        "save_response": sanitized_response,
                        "proceed_response": sanitized_proceed_response,
                        "file_response": sanitized_file_response,
                        "operations_requested": ["save", "proceed", "file"],
                        "operations_completed": ["draft_saved", "proceeded_to_file", "file_requested"],
                        "operations_failed": [],
                        "operation_outcomes": {
                            "save": {"status": "completed", "retryable": False},
                            "proceed": {"status": "completed", "retryable": False},
                            "file": {"status": "submitted", "retryable": False},
                        },
                        "next_action": "resync_for_arn_or_status",
                    },
                )
            return WhiteBooksSubmissionResult(
                provider_reference_id=auth_session.txn,
                provider_acknowledgement_id="",
                submission_state="submitted",
                provider_stage="proceeded_to_file",
                raw_response={
                    "mode": "live_gstr1_save_and_proceed",
                    "provider_stage": "proceeded_to_file",
                    "message": "WhiteBooks GSTR-1 draft save and proceed-to-file completed. Final filing is still not automated.",
                    "auth_session_id": str(auth_session.id),
                    "save_response": sanitized_response,
                    "proceed_response": sanitized_proceed_response,
                    "operations_requested": ["save", "proceed"],
                    "operations_completed": ["draft_saved", "proceeded_to_file"],
                    "operations_failed": [],
                    "operation_outcomes": {
                        "save": {"status": "completed", "retryable": False},
                        "proceed": {"status": "completed", "retryable": False},
                    },
                },
            )
        return WhiteBooksSubmissionResult(
            provider_reference_id=auth_session.txn,
            provider_acknowledgement_id="",
            submission_state="submitted",
            provider_stage="draft_saved",
            raw_response={
                "mode": "live_gstr1_save",
                "provider_stage": "draft_saved",
                "message": "WhiteBooks GSTR-1 draft save completed. Final filing is still not automated.",
                "auth_session_id": str(auth_session.id),
                "save_response": sanitized_response,
                "operations_requested": ["save"],
                "operations_completed": ["draft_saved"],
                "operations_failed": [],
                "operation_outcomes": {
                    "save": {"status": "completed", "retryable": False},
                },
            },
        )

    def _get_live_file_status(self, *, filing: ReturnFiling, provider_stage: str, operations_completed: list[str], next_action: str):
        auth_session = self._get_latest_auth_session(filing, required=False)
        if auth_session is None or not filing.provider_reference_id:
            return None
        return_type = str(filing.return_type or "").upper()
        rettype = return_type if return_type in {"GSTR1", "GSTR3B"} else None

        status_response = self.client.get_return_status(
            email=auth_session.email,
            gstin=filing.gstin.gstin if filing.gstin else "",
            returnperiod=self._get_return_period_code(filing),
            refid=filing.provider_reference_id,
            txn=auth_session.txn,
            rettype=rettype,
        )
        track_response = self.client.track_return(
            email=auth_session.email,
            gstin=filing.gstin.gstin if filing.gstin else "",
            returnperiod=self._get_return_period_code(filing),
            return_type=return_type or "GSTR3B",
            txn=auth_session.txn,
        )
        sanitized_status_response = self.client.sanitize_response_payload(status_response)
        sanitized_track_response = self.client.sanitize_response_payload(track_response)
        arn = self._extract_arn(sanitized_status_response) or self._extract_arn(sanitized_track_response) or filing.arn
        terminal_state = self._infer_terminal_submission_state(sanitized_status_response, sanitized_track_response)
        return {
            "provider_reference_id": filing.provider_reference_id,
            "submission_state": terminal_state or filing.status,
            "arn": arn,
            "raw_response": {
                "mode": "live",
                "provider_stage": provider_stage,
                "message": (
                    "WhiteBooks status sync confirmed the return as filed."
                    if terminal_state == "filed"
                    else "WhiteBooks status sync indicates the filing needs review before retry."
                    if terminal_state == "failed"
                    else "WhiteBooks final filing request is still awaiting ARN/status confirmation."
                ),
                "operations_completed": operations_completed,
                "next_action": "review_provider_failure" if terminal_state == "failed" else (next_action or "resync_for_arn_or_status"),
                "status_response": sanitized_status_response,
                "track_response": sanitized_track_response,
            },
        }

    def _get_return_period_code(self, filing: ReturnFiling) -> str:
        return filing.compliance_period.period.replace("-", "")[-6:]

    def _get_latest_auth_session(self, filing: ReturnFiling, *, required: bool = True) -> ProviderAuthSession | None:
        auth_sessions = ProviderAuthSession.objects.filter(
                is_active=True,
                workspace=filing.workspace,
                client=filing.client,
                provider=filing.provider,
            )
        if filing.gstin_id:
            auth_sessions = auth_sessions.filter(gstin=filing.gstin)
        auth_session = auth_sessions.filter(
            status__in=[ProviderAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED, ProviderAuthSession.SessionStatus.SESSION_ACTIVE]
        ).order_by("-verified_at", "-created_at").first()
        if auth_session is None:
            if required:
                raise WhiteBooksSubmissionError("A verified WhiteBooks auth session is required before live filing can begin.")
            return None
        if not auth_session.txn:
            if required:
                raise WhiteBooksSubmissionError("The latest WhiteBooks auth session does not include a txn value.")
            return None
        return auth_session

    def _extract_arn(self, payload):
        if isinstance(payload, dict):
            for key, value in payload.items():
                normalized = str(key).lower()
                if normalized in {"arn", "arnno", "arn_num"} and value:
                    return str(value)
                nested = self._extract_arn(value)
                if nested:
                    return nested
        if isinstance(payload, list):
            for item in payload:
                nested = self._extract_arn(item)
                if nested:
                    return nested
        return ""

    def _infer_terminal_submission_state(self, *payloads):
        if any(self._extract_arn(payload) for payload in payloads):
            return "filed"
        text_values = []
        for payload in payloads:
            text_values.extend(self._collect_text_values(payload))
        normalized = " ".join(value.lower() for value in text_values if value)
        if any(token in normalized for token in [" successfully filed", " status filed", " filed successfully", "return filed", "arn generated"]):
            return "filed"
        if any(token in normalized for token in [" rejected", " reject ", " filing failed", " return failed"]):
            return "failed"
        return ""

    def _collect_text_values(self, payload):
        values = []
        if isinstance(payload, dict):
            for value in payload.values():
                values.extend(self._collect_text_values(value))
        elif isinstance(payload, list):
            for item in payload:
                values.extend(self._collect_text_values(item))
        elif isinstance(payload, str):
            values.append(payload)
        return values

    def _validate_live_save_config(self, return_type: str):
        missing = []
        required_values = {
            "WHITEBOOKS_BASE_URL": self.client.base_url,
            "WHITEBOOKS_API_KEY": self.client.api_key,
            "WHITEBOOKS_API_SECRET": self.client.api_secret,
            "WHITEBOOKS_GST_USERNAME": self.client.gst_username,
            "WHITEBOOKS_STATE_CODE": self.client.state_code,
            "WHITEBOOKS_IP_ADDRESS": self.client.ip_address,
        }
        for key, value in required_values.items():
            if not value:
                missing.append(key)
        if missing:
            raise WhiteBooksConfigurationError(
                f"WhiteBooks live {self._get_return_type_display(return_type)} save is enabled, but required configuration is missing: {', '.join(sorted(missing))}."
            )

    def _get_return_type_display(self, return_type: str) -> str:
        normalized = str(return_type or "").lower()
        if normalized == "gstr1":
            return "GSTR-1"
        if normalized == "gstr3b":
            return "GSTR-3B"
        return normalized or "unknown return"
