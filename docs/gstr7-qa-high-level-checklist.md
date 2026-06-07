# GSTR-7 QA High-Level Checklist

Use this pack to validate the current GSTR-7 MVP flow end to end.

## Scope

- TDS deducted import
- GSTR-7 readiness
- GSTR-7 preparation
- GSTR-7 review page
- GSTR-7 workbook export
- approvals and operations review routing

## Related Files

- [gstr7-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-qa-detailed-scenarios.md:1)
- [12_gstr7_tds_uat/README.md](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/12_gstr7_tds_uat/README.md:1)

## High-Level Cases

### `G7-HL-001 TDS Import And Monthly Preparation`

Validate that a clean TDS deducted file imports successfully and produces a prepared GSTR-7 draft with correct deductee-wise totals.

### `G7-HL-002 GSTR-7 Review Workspace`

Validate that `/returns/gstr7-review` shows:

- overview metrics
- deductee-wise rows
- tax summary
- source imports
- no unexpected blockers for the clean case

### `G7-HL-003 Workbook Export`

Validate that `Export GSTR-7 XLSX` downloads a workbook with:

- `Summary`
- `Deductees`
- `Source Rows`
- `Validations`
- `Period Exceptions`

### `G7-HL-004 Warning Visibility`

Validate that a warning-focused TDS file produces readiness warnings for:

- zero TDS amount
- zero payment amount
- duplicate document numbers

and that those warnings appear in the review page and do not silently disappear.

### `G7-HL-005 Approval And Operations Review Entry`

Validate that prepared GSTR-7 drafts can be opened from:

- `/approvals`
- `/operations`

and land in the dedicated GSTR-7 review workspace instead of a generic modal-only flow.
