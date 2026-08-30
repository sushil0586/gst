from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0"}


def _is_https_origin(origin):
    return str(origin).startswith("https://")


def _has_wildcard(values):
    return any(str(value).strip() == "*" for value in values)


def _has_public_host(values):
    return any(str(value).strip() not in LOCAL_HOSTS and str(value).strip() != "*" for value in values)


class Command(BaseCommand):
    help = "Review the current runtime security posture and report warnings for risky production settings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--fail-on-warn",
            action="store_true",
            help="Exit with an error when any reviewed production posture check warns.",
        )

    def handle(self, *args, **options):
        allowed_hosts = list(settings.ALLOWED_HOSTS)
        cors_allowed_origins = list(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        csrf_trusted_origins = list(getattr(settings, "CSRF_TRUSTED_ORIGINS", []))
        email_backend = str(getattr(settings, "EMAIL_BACKEND", ""))
        app_frontend_url = str(getattr(settings, "APP_FRONTEND_URL", ""))

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
            (
                "ALLOWED_HOSTS restricted",
                bool(allowed_hosts) and not _has_wildcard(allowed_hosts) and _has_public_host(allowed_hosts),
                "ALLOWED_HOSTS should contain the intended public hosts and no wildcard-only/local-only posture.",
            ),
            (
                "CORS origins restricted",
                bool(cors_allowed_origins)
                and not _has_wildcard(cors_allowed_origins)
                and all(_is_https_origin(origin) for origin in cors_allowed_origins),
                "CORS_ALLOWED_ORIGINS should contain only HTTPS production frontend origins.",
            ),
            (
                "CSRF trusted origins restricted",
                bool(csrf_trusted_origins)
                and not _has_wildcard(csrf_trusted_origins)
                and all(_is_https_origin(origin) for origin in csrf_trusted_origins),
                "CSRF_TRUSTED_ORIGINS should contain only HTTPS production frontend origins.",
            ),
            ("API docs disabled", not bool(settings.ENABLE_API_DOCS), "ENABLE_API_DOCS should usually be False in production."),
            (
                "Frontend URL uses HTTPS",
                app_frontend_url.startswith("https://"),
                "APP_FRONTEND_URL should point at the HTTPS production frontend.",
            ),
            (
                "Email backend production-ready",
                "console" not in email_backend.lower(),
                "EMAIL_BACKEND still appears to be console-based; production notifications may not deliver.",
            ),
            (
                "Celery async execution enabled",
                not bool(settings.CELERY_TASK_ALWAYS_EAGER),
                "CELERY_TASK_ALWAYS_EAGER should be False so imports, reconciliation, filings, and scheduled work use workers.",
            ),
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
                "Tenant rollout enforced",
                bool(settings.FILING_ENFORCE_TENANT_ROLLOUT),
                "FILING_ENFORCE_TENANT_ROLLOUT should be enabled before public launch.",
            ),
            (
                "Maker-checker enforced",
                bool(settings.FILING_ENFORCE_MAKER_CHECKER),
                "FILING_ENFORCE_MAKER_CHECKER should be enabled before public launch.",
            ),
            (
                "Filing alert email enabled",
                bool(settings.FILING_ALERT_EMAIL_ENABLED),
                "FILING_ALERT_EMAIL_ENABLED should be enabled once alert routing is configured.",
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

        if warnings and options["fail_on_warn"]:
            raise CommandError(f"Security posture audit failed with {len(warnings)} warning(s).")
