from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegistrationRateThrottle(AnonRateThrottle):
    scope = "registration"


class CurrentUserRateThrottle(UserRateThrottle):
    scope = "session"


class ProviderOTPRequestRateThrottle(UserRateThrottle):
    scope = "provider_otp_request"


class ProviderOTPVerifyRateThrottle(UserRateThrottle):
    scope = "provider_otp_verify"


class SensitiveExportRateThrottle(ScopedRateThrottle):
    scope = "sensitive_exports"
