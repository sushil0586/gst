# Import Correction Implementation Backlog

## Purpose

This backlog converts the import-correction workflow plan into ticket-sized implementation phases.

It is designed to keep the work:

- policy-driven
- auditable
- safe for downstream reconciliation and return workflows
- free from page-level or view-level hardcoded business rules

Related document:

- [import-correction-workflow-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-workflow-plan.md:1)

## Delivery principles

- no hardcoded UI-only business rules
- no hidden state transitions inside serializers or components
- all correction permissions come from backend-evaluated policy
- all downstream invalidation comes from shared services
- all user-facing warnings are derived from impact-summary results

## Epic 1: Policy and state foundation

### Goal

Create the shared rule engine and lifecycle shape before mutation endpoints are built.

### Backend tickets

- `IMP-COR-001` define import-correction policy contract
  Output:
  - policy inputs
  - policy outputs
  - action-flag schema

- `IMP-COR-002` add import batch lifecycle extensions
  Output:
  - `corrected`
  - `superseded`
  - `discarded`
  - `locked`

- `IMP-COR-003` add downstream invalidation fields
  Output:
  - reconciliation stale markers
  - invalidation reason fields
  - return blocked-by-stale markers or equivalent flags

- `IMP-COR-004` implement `evaluate_import_correction_policy`
  Output:
  - computed action flags
  - warning message
  - next required action

- `IMP-COR-005` add `GET /imports/batches/{id}/correction-policy/`

### Frontend tickets

- `IMP-COR-006` add API types for correction policy and impact summary
- `IMP-COR-007` add imports-page action-state model based only on backend flags

### Exit criteria

- the UI can determine what is allowed without any local business-rule hardcoding

## Epic 2: Row correction workflow

### Goal

Allow safe row edit and row discard with validation reruns and downstream invalidation.

### Backend tickets

- `IMP-COR-101` define editable row representation
  Decision:
  - parsed-row editing only, or
  - parsed-row plus committed-transaction regeneration support

- `IMP-COR-102` implement row-edit validation flow
  Output:
  - field validation
  - duplicate checks
  - context checks

- `IMP-COR-103` implement `POST /imports/batches/{id}/rows/{row_id}/edit/`

- `IMP-COR-104` implement `POST /imports/batches/{id}/rows/{row_id}/discard/`

- `IMP-COR-105` implement `invalidate_downstream_from_import_change`
  Output:
  - reconciliation stale marking
  - return blocking when applicable

- `IMP-COR-106` implement `GET /imports/batches/{id}/impact-summary/`

### Frontend tickets

- `IMP-COR-107` add edit-row modal or panel
- `IMP-COR-108` add discard-row confirmation flow
- `IMP-COR-109` show downstream impact summary before save
- `IMP-COR-110` show stale reconciliation banner trigger after source edits

### Exit criteria

- operators can edit or discard rows
- every save reruns validation
- downstream stale state is visible immediately

## Epic 3: Batch discard and replacement workflow

### Goal

Support full-file abandonment or replacement without destroying audit history.

### Backend tickets

- `IMP-COR-201` implement `POST /imports/batches/{id}/discard/`
- `IMP-COR-202` implement processed-batch rollback rules
- `IMP-COR-203` implement `POST /imports/batches/{id}/replace/`
- `IMP-COR-204` add supersede linkage between old and new batches
- `IMP-COR-205` ensure replacement triggers downstream invalidation policy

### Frontend tickets

- `IMP-COR-206` add discard-batch flow
- `IMP-COR-207` add replace-file flow
- `IMP-COR-208` show superseded and active batch relationship in UI

### Exit criteria

- replacement does not erase history
- old and new batches are traceable
- downstream actions become obvious after replacement

## Epic 4: Reconciliation and return blocking UX

### Goal

Make downstream invalidation operationally obvious and safe.

### Backend tickets

- `IMP-COR-301` expose reconciliation stale reason in reconciliation APIs
- `IMP-COR-302` expose return blocked-by-stale-reconciliation state in return APIs
- `IMP-COR-303` prevent approval and filing when stale source dependencies remain

### Frontend tickets

- `IMP-COR-304` add reconciliation stale banner and rerun CTA
- `IMP-COR-305` add return blocking banner with explanation
- `IMP-COR-306` disable approve and file actions while stale
- `IMP-COR-307` show next required action in dashboard and imports views

### Exit criteria

- stale source data is impossible to miss
- users can see the next operational step clearly

## Epic 5: Approval and post-filing controls

### Goal

Respect maker-checker and post-filing safety boundaries.

### Backend tickets

- `IMP-COR-401` define elevated-role policy for approved-but-not-filed corrections
- `IMP-COR-402` enforce override rules after approval
- `IMP-COR-403` block direct source mutation after filing
- `IMP-COR-404` document corrective-adjustment path for post-filing changes

### Frontend tickets

- `IMP-COR-405` show elevated-override warnings after approval
- `IMP-COR-406` hide or disable direct edit/discard/replace after filing

### Exit criteria

- maker-checker boundaries are preserved
- filed data is no longer mutable through normal correction actions

## Epic 6: Audit and observability

### Goal

Ensure every correction action is explainable later.

### Backend tickets

- `IMP-COR-501` add audit events for row edit, row discard, batch discard, batch replace
- `IMP-COR-502` add audit events for reconciliation invalidation and return blocking
- `IMP-COR-503` include affected downstream object summaries in audit metadata

### Frontend tickets

- `IMP-COR-504` show correction events cleanly in audit trail and batch detail

### Exit criteria

- support and compliance can trace every correction action end to end

## Epic 7: QA and UAT

### Goal

Prove the workflow with realistic operator scenarios.

### Backend and integration tests

- `IMP-COR-601` test edit before reconciliation
- `IMP-COR-602` test edit after reconciliation and stale invalidation
- `IMP-COR-603` test replacement upload after reconciliation
- `IMP-COR-604` test return approval blocking
- `IMP-COR-605` test post-filing edit rejection

### Frontend tests

- `IMP-COR-606` test correction action visibility by policy flags
- `IMP-COR-607` test warning and impact-summary UX
- `IMP-COR-608` test stale banners and disabled return actions

### UAT scenarios

- `IMP-COR-609` wrong file uploaded and discarded
- `IMP-COR-610` invalid rows corrected inline
- `IMP-COR-611` reconciled data changed and rerun requested
- `IMP-COR-612` return blocked after source correction

## Suggested execution order

1. Epic 1
2. Epic 2
3. Epic 4
4. Epic 3
5. Epic 5
6. Epic 6
7. Epic 7

This order ensures we have policy and invalidation safety before expanding mutation options.

## Recommended first sprint

Best first sprint scope:

- `IMP-COR-001`
- `IMP-COR-002`
- `IMP-COR-003`
- `IMP-COR-004`
- `IMP-COR-005`
- `IMP-COR-006`
- `IMP-COR-007`

This gives us the shared contract first, which is the safest way to avoid hardcoded drift later.
