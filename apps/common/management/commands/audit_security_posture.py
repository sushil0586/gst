from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Review the current runtime security posture and report warnings for risky production settings."

    def handle(self, *args, **options):
        checks = [
            ("DEBUG disabled", not settings.DEBUG, "DEBUG should be False in production."),
            ("Strong SECRET_KEY", not str(settings.SECRET_KEY).startswith("change-me"), "SECRET_KEY still looks like a placeholder."),
            (
                "Strong JWT_SIGNING_KEY",
                not str(settings.SIMPLE_JWT.get("SIGNING_KEY", "")).startswith("change-me"),
                "JWT_SIGNING_KEY still looks like a placeholder.",
            ),
            ("SSL redirect enabled", bool(settings.SECURE_SSL_REDIRECT), "SECURE_SSL_REDIRECT should be enabled in production."),
            ("Session cookies secure", bool(settings.SESSION_COOKIE_SECURE), "SESSION_COOKIE_SECURE should be enabled in production."),
            ("CSRF cookies secure", bool(settings.CSRF_COOKIE_SECURE), "CSRF_COOKIE_SECURE should be enabled in production."),
            ("HSTS configured", int(settings.SECURE_HSTS_SECONDS) > 0, "SECURE_HSTS_SECONDS should be greater than zero in production."),
            ("API docs disabled", not bool(settings.ENABLE_API_DOCS), "ENABLE_API_DOCS should usually be False in production."),
            (
                "WhiteBooks TLS verify",
                bool(settings.WHITEBOOKS_SSL_VERIFY),
                "WHITEBOOKS_SSL_VERIFY should remain enabled outside local debugging.",
            ),
            (
                "Security retention enabled",
                bool(settings.SECURITY_RETENTION_ENABLED),
                "SECURITY_RETENTION_ENABLED is off, so aged sensitive payloads will keep accumulating.",
            ),
            (
                "Security logging configured",
                bool(settings.SECURITY_LOG_LEVEL),
                "SECURITY_LOG_LEVEL is empty, so the security logger is not clearly configured.",
            ),
        ]

        warnings = []
        self.stdout.write(self.style.WARNING("Security posture review"))
        for label, passed, warning in checks:
            marker = self.style.SUCCESS("OK") if passed else self.style.ERROR("WARN")
            self.stdout.write(f"- {marker} {label}")
            if not passed:
                warnings.append(warning)

        if warnings:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Recommended follow-up"))
            for warning in warnings:
                self.stdout.write(f"- {warning}")
        else:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("All reviewed security posture checks passed."))
