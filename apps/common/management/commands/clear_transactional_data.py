from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.approvals.models import ApprovalRequest
from apps.audit_logs.models import AuditLog
from apps.gst_transactions.models import GSTTransaction
from apps.imports.models import ImportBatch, ImportRowError
from apps.notices.models import Notice
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation


class Command(BaseCommand):
    help = (
        "Delete transactional GST compliance data while preserving master setup "
        "(users, organizations, workspaces, clients, GSTINs, compliance periods, templates, memberships)."
    )

    transactional_models = [
        ("audit_logs", AuditLog),
        ("approval_requests", ApprovalRequest),
        ("return_preparations", ReturnPreparation),
        ("reconciliation_items", ReconciliationItem),
        ("reconciliation_runs", ReconciliationRun),
        ("gst_transactions", GSTTransaction),
        ("import_row_errors", ImportRowError),
        ("import_batches", ImportBatch),
        ("notices", Notice),
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirm deletion. Required unless --dry-run is used.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without deleting anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        confirmed = options["yes"]

        counts = self._collect_counts()
        total_records = sum(counts.values())

        if not dry_run and not confirmed:
            raise CommandError("This command is destructive. Re-run with --yes, or use --dry-run first.")

        self.stdout.write(self.style.WARNING("Transactional data scope"))
        for label, _model in self.transactional_models:
            self.stdout.write(f"- {label}: {counts[label]}")
        self.stdout.write(f"Total records: {total_records}")

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only. No data was deleted."))
            return

        with transaction.atomic():
            self._delete_import_files()
            for _label, model in self.transactional_models:
                model.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("Transactional data deleted successfully."))

    def _collect_counts(self):
        return {label: model.objects.count() for label, model in self.transactional_models}

    def _delete_import_files(self):
        for batch in ImportBatch.objects.exclude(file="").iterator():
            if batch.file:
                batch.file.delete(save=False)
