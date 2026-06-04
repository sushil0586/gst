from apps.filings.models import ReturnFiling
from apps.filings.providers.base import FilingProvider, ProviderCapabilitySet, ProviderStageDefinition
from apps.integrations.whitebooks.types import WhiteBooksSession, WhiteBooksSubmissionResult


class DemoGSPProvider(FilingProvider):
    provider_code = ReturnFiling.Provider.DEMO_GSP
    stage_definitions = {
        "demo_saved": ProviderStageDefinition(
            stage="demo_saved",
            requested_event_type="filing.demo_save_requested",
            requested_audit_action="return_filing.demo_save_requested",
            completed_event_type="filing.demo_saved",
            completed_audit_action="return_filing.demo_saved",
            failed_event_type="filing.demo_save_failed",
            failed_audit_action="return_filing.demo_save_failed",
        )
    }

    def prepare_payload(self, filing):
        return {
            "provider": self.provider_code,
            "prepared_return_id": str(filing.prepared_return_id),
            "return_type": filing.return_type,
            "compliance_period": filing.compliance_period.period,
        }

    def get_capabilities(self, filing=None, payload=None) -> ProviderCapabilitySet:
        return ProviderCapabilitySet(
            sandbox_mode=True,
            auth_session_required=True,
            live_submission_enabled=False,
            live_status_sync_enabled=False,
            supported_operations={
                "save": True,
                "proceed": False,
                "file": False,
                "offset": False,
            },
        )

    def planned_submission_stage(self, filing) -> str:
        return "demo_saved"

    def request_otp(self, *, email: str, state_code: str | None = None, gst_username: str | None = None) -> dict:
        return {
            "status": "otp_requested",
            "header": {"txn": "demo-txn-001"},
            "provider": self.provider_code,
            "email": email,
            "state_code": state_code,
            "gst_username": gst_username,
        }

    def exchange_otp_for_session(
        self,
        *,
        email: str,
        otp: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> WhiteBooksSession:
        return WhiteBooksSession(
            mode="demo",
            authenticated=True,
            raw_response={
                "status": "session_active",
                "provider": self.provider_code,
                "header": {"txn": txn},
            },
            metadata={
                "provider": self.provider_code,
                "txn": txn,
                "state_code": state_code,
                "gst_username": gst_username,
                "response_contract_confirmed": True,
            },
        )

    def submit_return(self, filing) -> tuple[dict, WhiteBooksSubmissionResult]:
        payload = self.prepare_payload(filing)
        return payload, WhiteBooksSubmissionResult(
            provider_reference_id=f"demo-ref-{filing.id}",
            provider_acknowledgement_id=f"demo-ack-{filing.id}",
            submission_state="submitted",
            provider_stage="demo_saved",
            raw_response={
                "mode": "demo_gsp",
                "provider_stage": "demo_saved",
                "message": "Demo GSP accepted the filing payload.",
                "operations_completed": ["demo_saved"],
            },
        )

    def get_status(self, filing) -> dict:
        if filing.status == ReturnFiling.FilingStatus.SUBMITTED:
            return {
                "provider_reference_id": filing.provider_reference_id,
                "submission_state": "filed",
                "arn": f"DEMO-ARN-{str(filing.id)[:8].upper()}",
                "raw_response": {
                    "mode": "demo_gsp",
                    "provider_stage": "demo_saved",
                    "message": "Demo GSP marked filing as filed.",
                },
            }
        return {
            "provider_reference_id": filing.provider_reference_id,
            "submission_state": filing.status,
            "arn": filing.arn,
            "raw_response": {
                "mode": "demo_gsp",
                "provider_stage": "demo_saved",
            },
        }
