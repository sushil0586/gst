from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProviderStageDefinition:
    stage: str
    requested_event_type: str
    requested_audit_action: str
    completed_event_type: str
    completed_audit_action: str
    failed_event_type: str
    failed_audit_action: str


@dataclass(frozen=True)
class ProviderCapabilitySet:
    sandbox_mode: bool = True
    auth_session_required: bool = False
    live_submission_enabled: bool = False
    live_status_sync_enabled: bool = False
    supported_operations: dict[str, bool] = field(default_factory=dict)
    rollout_enabled: bool = True
    rollout_reason: str = ""


class FilingProvider(ABC):
    provider_code = ""
    stage_definitions: dict[str, ProviderStageDefinition] = {}

    @abstractmethod
    def prepare_payload(self, filing):
        raise NotImplementedError

    @abstractmethod
    def submit_return(self, filing):
        raise NotImplementedError

    @abstractmethod
    def get_status(self, filing):
        raise NotImplementedError

    def get_capabilities(self, filing=None, payload=None) -> ProviderCapabilitySet:
        return ProviderCapabilitySet()

    def planned_submission_stage(self, filing) -> str:
        return "submitted"

    def requested_stages_for(self, planned_stage: str, filing=None) -> list[str]:
        return [planned_stage] if planned_stage in self.stage_definitions else []

    def completed_stages_from_result(self, result) -> list[str]:
        raw_response = result.raw_response if isinstance(result.raw_response, dict) else {}
        operations_completed = raw_response.get("operations_completed")
        if isinstance(operations_completed, list) and operations_completed:
            return [stage for stage in operations_completed if isinstance(stage, str) and stage]
        if result.provider_stage in self.stage_definitions:
            return [result.provider_stage]
        return []

    def failure_markers(self, provider_stage: str, retryable: bool = False) -> tuple[str, str]:
        if retryable and provider_stage not in self.stage_definitions:
            return "filing.retry_requested", "return_filing.needs_retry"
        definition = self.stage_definitions.get(provider_stage)
        if definition:
            return definition.failed_event_type, definition.failed_audit_action
        return "filing.failed", "return_filing.failed"

    def requested_definition(self, stage: str) -> ProviderStageDefinition | None:
        return self.stage_definitions.get(stage)
