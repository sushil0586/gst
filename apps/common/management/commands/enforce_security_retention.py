from django.core.management.base import BaseCommand

from django.conf import settings

from apps.common.services.retention import enforce_security_retention


class Command(BaseCommand):
    help = "Compact or purge aged sensitive operational payloads according to configured retention windows."

    def add_arguments(self, parser):
        parser.add_argument("--audit-days", type=int, default=settings.SECURITY_RETENTION_AUDIT_DAYS)
        parser.add_argument("--filing-days", type=int, default=settings.SECURITY_RETENTION_FILING_DAYS)
        parser.add_argument("--provider-auth-days", type=int, default=settings.SECURITY_RETENTION_PROVIDER_AUTH_DAYS)
        parser.add_argument("--import-days", type=int, default=settings.SECURITY_RETENTION_IMPORT_DAYS)

    def handle(self, *args, **options):
        counters = enforce_security_retention(
            audit_days=options["audit_days"],
            filing_days=options["filing_days"],
            provider_auth_days=options["provider_auth_days"],
            import_days=options["import_days"],
        )
        for key, value in counters.items():
            self.stdout.write(f"{key}: {value}")
        self.stdout.write(self.style.SUCCESS("Security retention enforcement completed."))
