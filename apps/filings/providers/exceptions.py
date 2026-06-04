class FilingProviderError(Exception):
    """Base filing provider integration error."""


class FilingProviderAuthenticationError(FilingProviderError):
    """Raised when provider authentication fails."""


class FilingProviderSessionLimitError(FilingProviderAuthenticationError):
    """Raised when the provider rejects auth due to concurrent session limits."""


class FilingProviderSessionPayloadUnresolvedError(FilingProviderAuthenticationError):
    """Raised when a provider auth flow completes but the session contract is still unresolved."""


class FilingProviderSubmissionError(FilingProviderError):
    """Raised when the provider rejects a filing submission step."""


class FilingProviderStepError(FilingProviderSubmissionError):
    """Raised when a later provider step fails after earlier steps may have succeeded."""

    def __init__(
        self,
        message,
        *,
        provider_stage="",
        partial_response=None,
        completed_stages=None,
        provider_reference_id="",
        provider_acknowledgement_id="",
        retryable=False,
        error_code="provider_step_error",
    ):
        super().__init__(message)
        self.provider_stage = provider_stage
        self.partial_response = partial_response or {}
        self.completed_stages = completed_stages or []
        self.provider_reference_id = provider_reference_id
        self.provider_acknowledgement_id = provider_acknowledgement_id
        self.retryable = retryable
        self.error_code = error_code


class FilingProviderConfigurationError(FilingProviderSubmissionError):
    """Raised when provider live transport is enabled but required configuration is missing."""


class FilingProviderTemporaryError(FilingProviderError):
    """Raised for retryable provider or transport failures."""
