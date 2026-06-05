import re

from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle


RATE_PERIOD_RE = re.compile(r"^(?:(?P<count>\d+)\s*)?(?P<unit>second|minute|hour|day)s?$")


class FlexibleRateParsingMixin:
    UNIT_SECONDS = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    def parse_rate(self, rate):
        if rate is None:
            return (None, None)

        num, period = rate.split("/")
        num_requests = int(num)
        normalized = period.strip().lower()

        # Keep DRF-compatible short formats like "minute" or "hour" working.
        if normalized and normalized[0] in {"s", "m", "h", "d"} and normalized in {"s", "sec", "second", "seconds", "m", "min", "minute", "minutes", "h", "hr", "hour", "hours", "d", "day", "days"}:
            duration = {
                "s": 1,
                "sec": 1,
                "second": 1,
                "seconds": 1,
                "m": 60,
                "min": 60,
                "minute": 60,
                "minutes": 60,
                "h": 3600,
                "hr": 3600,
                "hour": 3600,
                "hours": 3600,
                "d": 86400,
                "day": 86400,
                "days": 86400,
            }[normalized]
            return (num_requests, duration)

        match = RATE_PERIOD_RE.match(normalized)
        if not match:
            raise ValueError(f"Invalid throttle rate period: {period!r}")

        multiplier = int(match.group("count") or "1")
        unit = match.group("unit")
        return (num_requests, multiplier * self.UNIT_SECONDS[unit])


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegistrationRateThrottle(AnonRateThrottle):
    scope = "registration"


class CurrentUserRateThrottle(UserRateThrottle):
    scope = "session"


class ProviderOTPRequestRateThrottle(FlexibleRateParsingMixin, UserRateThrottle):
    scope = "provider_otp_request"


class ProviderOTPVerifyRateThrottle(FlexibleRateParsingMixin, UserRateThrottle):
    scope = "provider_otp_verify"


class SensitiveExportRateThrottle(ScopedRateThrottle):
    scope = "sensitive_exports"
