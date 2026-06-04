from apps.filings.providers.exceptions import (
    FilingProviderAuthenticationError,
    FilingProviderConfigurationError,
    FilingProviderError,
    FilingProviderSessionLimitError,
    FilingProviderSessionPayloadUnresolvedError,
    FilingProviderStepError,
    FilingProviderSubmissionError,
    FilingProviderTemporaryError,
)


class WhiteBooksError(FilingProviderError):
    """Base WhiteBooks integration error."""


class WhiteBooksAuthenticationError(FilingProviderAuthenticationError, WhiteBooksError):
    """Raised when WhiteBooks authentication fails."""


class WhiteBooksSessionLimitError(FilingProviderSessionLimitError, WhiteBooksAuthenticationError):
    """Raised when the GSP account has exceeded the allowed concurrent session limit."""


class WhiteBooksSessionPayloadUnresolvedError(FilingProviderSessionPayloadUnresolvedError, WhiteBooksAuthenticationError):
    """Raised when a live auth response is available but its session contract is not confirmed yet."""


class WhiteBooksSubmissionError(FilingProviderSubmissionError, WhiteBooksError):
    """Raised when WhiteBooks rejects a filing submission."""


class WhiteBooksStepError(FilingProviderStepError, WhiteBooksSubmissionError):
    """Raised when a specific WhiteBooks filing step fails after earlier steps may have succeeded."""


class WhiteBooksConfigurationError(FilingProviderConfigurationError, WhiteBooksSubmissionError):
    """Raised when live WhiteBooks submission is enabled but required configuration is missing."""


class WhiteBooksTemporaryError(FilingProviderTemporaryError, WhiteBooksError):
    """Raised for retryable transport or provider-side failures."""
