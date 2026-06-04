from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.filings.models import ReturnFiling
from apps.imports.models import ImportBatch
from apps.reconciliation.models import ReconciliationRun
from apps.returns.models import ReturnPreparation


ELEVATED_CORRECTION_ROLES = {
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MANAGER,
    WorkspaceRole.REVIEWER,
    WorkspaceRole.SENIOR_CA,
}


@dataclass
class ImportCorrectionPolicyResult:
    lifecycle_state: str
    can_edit_rows: bool
    can_discard_rows: bool
    can_discard_batch: bool
    can_replace_file: bool
    can_reprocess: bool
    has_downstream_dependencies: bool
    requires_reconciliation_rerun: bool
    requires_return_refresh: bool
    is_locked_by_filing: bool
    requires_elevated_role: bool
    warning_message: str
    next_required_action: str
    affected_reconciliation_runs: int
    affected_return_preparations: int
    affected_filings: int
    invalidation_reason: str

    def to_dict(self) -> dict[str, object]:
        return {
            "lifecycle_state": self.lifecycle_state,
            "can_edit_rows": self.can_edit_rows,
            "can_discard_rows": self.can_discard_rows,
            "can_discard_batch": self.can_discard_batch,
            "can_replace_file": self.can_replace_file,
            "can_reprocess": self.can_reprocess,
            "has_downstream_dependencies": self.has_downstream_dependencies,
            "requires_reconciliation_rerun": self.requires_reconciliation_rerun,
            "requires_return_refresh": self.requires_return_refresh,
            "is_locked_by_filing": self.is_locked_by_filing,
            "requires_elevated_role": self.requires_elevated_role,
            "warning_message": self.warning_message,
            "next_required_action": self.next_required_action,
            "affected_reconciliation_runs": self.affected_reconciliation_runs,
            "affected_return_preparations": self.affected_return_preparations,
            "affected_filings": self.affected_filings,
            "invalidation_reason": self.invalidation_reason,
        }


@dataclass
class ImportImpactAction:
    key: str
    label: str
    allowed: bool
    reason: str

    def to_dict(self) -> dict[str, object]:
        return {
            "key": self.key,
            "label": self.label,
            "allowed": self.allowed,
            "reason": self.reason,
        }


@dataclass
class ImportImpactSummaryResult:
    summary_title: str
    summary_message: str
    severity: str
    next_required_action: str
    invalidation_reason: str
    lifecycle_state: str
    actions: list[ImportImpactAction]
    affected_reconciliation_runs: int
    affected_return_preparations: int
    affected_filings: int

    def to_dict(self) -> dict[str, object]:
        return {
            "summary_title": self.summary_title,
            "summary_message": self.summary_message,
            "severity": self.severity,
            "next_required_action": self.next_required_action,
            "invalidation_reason": self.invalidation_reason,
            "lifecycle_state": self.lifecycle_state,
            "actions": [action.to_dict() for action in self.actions],
            "affected_reconciliation_runs": self.affected_reconciliation_runs,
            "affected_return_preparations": self.affected_return_preparations,
            "affected_filings": self.affected_filings,
        }


def get_import_correction_policy() -> dict[str, object]:
    configured_policy = getattr(settings, "IMPORT_CORRECTION_POLICY", {}) or {}
    return {
        "allow_import_edit_after_reconciliation": configured_policy.get("allow_import_edit_after_reconciliation", True),
        "allow_import_discard_after_processing": configured_policy.get("allow_import_discard_after_processing", True),
        "allow_import_mutation_after_return_approval": configured_policy.get("allow_import_mutation_after_return_approval", False),
        "allow_import_mutation_after_filing": configured_policy.get("allow_import_mutation_after_filing", False),
        "require_reconciliation_rerun_after_source_change": configured_policy.get(
            "require_reconciliation_rerun_after_source_change", True
        ),
        "block_return_approval_on_stale_reconciliation": configured_policy.get(
            "block_return_approval_on_stale_reconciliation", True
        ),
        "block_return_filing_on_stale_reconciliation": configured_policy.get(
            "block_return_filing_on_stale_reconciliation", True
        ),
        "replacement_upload_creates_new_batch_version": configured_policy.get(
            "replacement_upload_creates_new_batch_version", True
        ),
    }


def evaluate_import_correction_policy(*, batch: ImportBatch, user=None) -> ImportCorrectionPolicyResult:
    policy = get_import_correction_policy()
    reconciliation_qs = ReconciliationRun.objects.filter(
        compliance_period_id=batch.compliance_period_id,
        is_active=True,
    ).exclude(status=ReconciliationRun.RunStatus.FAILED)
    return_prep_qs = ReturnPreparation.objects.filter(
        compliance_period_id=batch.compliance_period_id,
        is_active=True,
    )
    filing_qs = ReturnFiling.objects.filter(
        compliance_period_id=batch.compliance_period_id,
        is_active=True,
    )

    has_reconciliation = reconciliation_qs.exists()
    has_return_preparation = return_prep_qs.exists()
    has_approved_return = return_prep_qs.filter(status=ReturnPreparation.PreparationStatus.APPROVED).exists()
    has_filed_return = return_prep_qs.filter(status=ReturnPreparation.PreparationStatus.FILED).exists()
    has_filing_records = filing_qs.exists()
    has_filed_filing = filing_qs.filter(status=ReturnFiling.FilingStatus.FILED).exists()

    is_terminal_batch_state = batch.status in {
        ImportBatch.BatchStatus.DISCARDED,
        ImportBatch.BatchStatus.SUPERSEDED,
        ImportBatch.BatchStatus.LOCKED,
    }
    is_locked_by_filing = has_filed_return or has_filed_filing or (
        not policy["allow_import_mutation_after_filing"] and has_filing_records
    )

    user_has_elevated_role = _user_has_elevated_correction_role(user=user, workspace_id=batch.workspace_id)
    requires_elevated_role = has_approved_return and not policy["allow_import_mutation_after_return_approval"]
    can_mutate_after_approval = not requires_elevated_role or user_has_elevated_role

    can_edit_for_reconciliation_state = (not has_reconciliation) or policy["allow_import_edit_after_reconciliation"]
    can_edit_rows = (
        not is_terminal_batch_state
        and not is_locked_by_filing
        and can_edit_for_reconciliation_state
        and can_mutate_after_approval
    )
    can_discard_rows = can_edit_rows
    can_discard_batch = (
        not is_terminal_batch_state
        and not is_locked_by_filing
        and can_mutate_after_approval
        and (
            batch.status in {ImportBatch.BatchStatus.UPLOADED, ImportBatch.BatchStatus.VALIDATED, ImportBatch.BatchStatus.FAILED}
            or policy["allow_import_discard_after_processing"]
        )
    )
    can_replace_file = not is_terminal_batch_state and not is_locked_by_filing and can_mutate_after_approval
    can_reprocess = batch.status in {
        ImportBatch.BatchStatus.FAILED,
        ImportBatch.BatchStatus.VALIDATED,
        ImportBatch.BatchStatus.CORRECTED,
        ImportBatch.BatchStatus.PROCESSED,
    } and not is_locked_by_filing

    requires_reconciliation_rerun = has_reconciliation and policy["require_reconciliation_rerun_after_source_change"]
    requires_return_refresh = has_return_preparation and (
        policy["block_return_approval_on_stale_reconciliation"]
        or policy["block_return_filing_on_stale_reconciliation"]
    )
    has_downstream_dependencies = has_reconciliation or has_return_preparation or has_filing_records

    warning_message = ""
    next_required_action = ""
    invalidation_reason = ""
    if is_locked_by_filing:
        warning_message = "This import is locked because filing has already started or completed for the compliance period."
        next_required_action = "Use a corrective adjustment workflow instead of modifying the original import."
        invalidation_reason = "filing_in_progress_or_completed"
    elif requires_elevated_role and not user_has_elevated_role:
        warning_message = "This import affects an approved return. An elevated workspace role is required to continue."
        next_required_action = "Request review or elevated override before correcting the import."
        invalidation_reason = "approved_return_requires_override"
    elif requires_reconciliation_rerun:
        warning_message = (
            "This import has already been used in reconciliation. Saving changes will mark reconciliation as outdated "
            "and require a rerun before return processing can continue."
        )
        next_required_action = "Re-run reconciliation after the source correction is saved."
        invalidation_reason = "source_import_modified"
    elif requires_return_refresh:
        warning_message = (
            "This import is already linked to return preparation. Correcting the source data will require the return "
            "draft to be refreshed before approval or filing."
        )
        next_required_action = "Refresh return preparation after the correction is applied."
        invalidation_reason = "return_preparation_depends_on_import"

    return ImportCorrectionPolicyResult(
        lifecycle_state=batch.status,
        can_edit_rows=can_edit_rows,
        can_discard_rows=can_discard_rows,
        can_discard_batch=can_discard_batch,
        can_replace_file=can_replace_file,
        can_reprocess=can_reprocess,
        has_downstream_dependencies=has_downstream_dependencies,
        requires_reconciliation_rerun=requires_reconciliation_rerun,
        requires_return_refresh=requires_return_refresh,
        is_locked_by_filing=is_locked_by_filing,
        requires_elevated_role=requires_elevated_role and not user_has_elevated_role,
        warning_message=warning_message,
        next_required_action=next_required_action,
        affected_reconciliation_runs=reconciliation_qs.count(),
        affected_return_preparations=return_prep_qs.count(),
        affected_filings=filing_qs.count(),
        invalidation_reason=invalidation_reason or batch.invalidation_reason,
    )


def build_import_impact_summary(*, batch: ImportBatch, user=None) -> ImportImpactSummaryResult:
    policy = evaluate_import_correction_policy(batch=batch, user=user)

    actions = [
        ImportImpactAction(
            key="edit_rows",
            label="Edit rows",
            allowed=policy.can_edit_rows,
            reason=_action_reason(
                allowed=policy.can_edit_rows,
                blocked_reason=policy.warning_message or "Policy currently blocks row editing for this batch.",
            ),
        ),
        ImportImpactAction(
            key="discard_rows",
            label="Discard rows",
            allowed=policy.can_discard_rows,
            reason=_action_reason(
                allowed=policy.can_discard_rows,
                blocked_reason=policy.warning_message or "Policy currently blocks row discard for this batch.",
            ),
        ),
        ImportImpactAction(
            key="discard_batch",
            label="Discard batch",
            allowed=policy.can_discard_batch,
            reason=_action_reason(
                allowed=policy.can_discard_batch,
                blocked_reason=policy.warning_message or "Policy currently blocks batch discard for this batch.",
            ),
        ),
        ImportImpactAction(
            key="replace_file",
            label="Replace file",
            allowed=policy.can_replace_file,
            reason=_action_reason(
                allowed=policy.can_replace_file,
                blocked_reason=policy.warning_message or "Policy currently blocks file replacement for this batch.",
            ),
        ),
        ImportImpactAction(
            key="reprocess",
            label="Reprocess batch",
            allowed=policy.can_reprocess,
            reason=_action_reason(
                allowed=policy.can_reprocess,
                blocked_reason=policy.warning_message or "Policy currently blocks reprocessing for this batch.",
            ),
        ),
    ]

    if policy.is_locked_by_filing:
        summary_title = "Batch locked by filing"
        summary_message = policy.warning_message
        severity = "danger"
    elif policy.requires_elevated_role:
        summary_title = "Elevated approval required"
        summary_message = policy.warning_message
        severity = "danger"
    elif policy.requires_reconciliation_rerun or policy.requires_return_refresh:
        summary_title = "Downstream revalidation required"
        summary_message = policy.warning_message
        severity = "warning"
    elif policy.has_downstream_dependencies:
        summary_title = "Downstream dependencies detected"
        summary_message = "This batch is already linked to downstream work, but corrections remain available under the active policy."
        severity = "primary"
    else:
        summary_title = "Correction ready"
        summary_message = "This batch can move into correction flows without invalidating filing state."
        severity = "success"

    return ImportImpactSummaryResult(
        summary_title=summary_title,
        summary_message=summary_message,
        severity=severity,
        next_required_action=policy.next_required_action,
        invalidation_reason=policy.invalidation_reason,
        lifecycle_state=policy.lifecycle_state,
        actions=actions,
        affected_reconciliation_runs=policy.affected_reconciliation_runs,
        affected_return_preparations=policy.affected_return_preparations,
        affected_filings=policy.affected_filings,
    )


def _user_has_elevated_correction_role(*, user, workspace_id) -> bool:
    if user is None or workspace_id is None:
        return False
    return WorkspaceMembership.objects.filter(
        user=user,
        workspace_id=workspace_id,
        is_active=True,
        role__in=ELEVATED_CORRECTION_ROLES,
    ).exists()


def _action_reason(*, allowed: bool, blocked_reason: str) -> str:
    if allowed:
        return "Allowed under the active import correction policy."
    return blocked_reason
