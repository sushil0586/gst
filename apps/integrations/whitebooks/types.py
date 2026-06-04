from dataclasses import dataclass, field
from typing import Any


@dataclass
class WhiteBooksSession:
    mode: str
    authenticated: bool
    raw_response: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def response_contract_confirmed(self) -> bool:
        return bool(self.metadata.get("response_contract_confirmed"))


@dataclass
class WhiteBooksSubmissionResult:
    provider_reference_id: str
    provider_acknowledgement_id: str = ""
    arn: str = ""
    submission_state: str = "submitted"
    provider_stage: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)
