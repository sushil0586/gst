# GSTR-7 QA Detailed Scenarios

## Scope

This detailed script expands the current GSTR-7 MVP QA flow:

- `G7-HL-001`
- `G7-HL-002`
- `G7-HL-003`
- `G7-HL-004`
- `G7-HL-005`

It is designed for the current product slice where GSTR-7 supports:

- import
- readiness
- preparation
- review
- export
- approvals and operations review entry

It does not assume a live or manual filing path yet.

## Related Files

- [gstr7-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-qa-high-level-checklist.md:1)
- [12_gstr7_tds_uat/README.md](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/12_gstr7_tds_uat/README.md:1)

## Bundle Used

- [tds_deducted_gstr7_main.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/12_gstr7_tds_uat/tds_deducted_gstr7_main.csv)
- [tds_deducted_gstr7_warnings.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/12_gstr7_tds_uat/tds_deducted_gstr7_warnings.csv)

## Detailed Cases

## G7-DT-001 Clean GSTR-7 Monthly Preparation

### Objective

Prove that a clean TDS deducted dataset can move end to end through:

- import
- readiness
- GSTR-7 preparation
- GSTR-7 review
- workbook export

### Recommended Context

Use a fresh monthly context, for example:

- workspace: any active test workspace
- client: any active test client
- GSTIN: any active GSTIN
- compliance period: `2026-06`

### Upload Order

1. Upload `tds_deducted_gstr7_main.csv` as `TDS deducted`
2. Open `/returns`
3. Review the GSTR-7 readiness card
4. Prepare `GSTR-7`
5. Open `GSTR-7 Review`
6. Export `GSTR-7 XLSX`
7. Open `/approvals` and verify the review link
8. Open `/operations` and verify the review link if a GSTR-7 return appears in the operational context later

### Expected Import Outcome

Expected:

- batch processes successfully
- `3` valid TDS rows are created

### Expected GSTR-7 Readiness Outcome

Expected:

- readiness status is `ready`
- no blockers
- no warnings

### Expected GSTR-7 Snapshot Outcome

After preparing `GSTR-7`, the prepared snapshot should show:

#### `tds_summary`

- `document_count` = `3`
- `deductee_count` = `2`
- `payment_amount` = `165000.00`
- `taxable_value` = `165000.00`
- `cgst_amount` = `625.00`
- `sgst_amount` = `625.00`
- `igst_amount` = `800.00`
- `tds_amount` = `2050.00`

#### `deductees.rows`

Expected deductee rows:

1. `27ABCDE1234F1Z5 / Deductee Two`
   - `document_count` = `1`
   - `payment_amount` = `40000.00`
   - `taxable_value` = `40000.00`
   - `igst_amount` = `800.00`
   - `cgst_amount` = `0.00`
   - `sgst_amount` = `0.00`
   - `tds_amount` = `800.00`

2. `29ABCDE1234F1Z5 / Deductee One`
   - `document_count` = `2`
   - `payment_amount` = `125000.00`
   - `taxable_value` = `125000.00`
   - `igst_amount` = `0.00`
   - `cgst_amount` = `625.00`
   - `sgst_amount` = `625.00`
   - `tds_amount` = `1250.00`

### Expected Review Page Outcome

On `/returns/gstr7-review`:

- `Overview` should show:
  - deductees = `2`
  - documents = `3`
  - payment amount = `165000.00`
  - TDS deducted = `2050.00`
- `Deductees` tab should show the two deductee groups above
- `Tax Summary` should show the same monthly tax totals as the prepared snapshot
- `Warnings` tab should show no active warnings for this clean case
- `Source Imports` should list the `TDS deducted` batch for this period

### Expected Workbook Outcome

The exported workbook should contain:

- sheet `Summary`
- sheet `Deductees`
- sheet `Source Rows`
- sheet `Validations`
- sheet `Period Exceptions`

Workbook checks:

- `Summary` shows `GSTR-7`
- `Summary` shows deductee count `2`
- `Summary` shows total TDS deducted `2050.00`
- `Deductees` contains both deductee GSTINs
- `Source Rows` contains:
  - `TDS-7001`
  - `TDS-7002`
  - `TDS-7003`

### Pass Criteria

This case passes if:

- import succeeds
- GSTR-7 prepares successfully
- readiness is clean
- review page totals match the snapshot
- workbook totals match the review page

## G7-DT-002 Warning-Focused GSTR-7 Review

### Objective

Prove that the current GSTR-7 readiness and review surface correctly show warning-only quality issues without blocking preparation.

### Recommended Context

Use a separate fresh monthly context, for example:

- compliance period: `2026-07`

### Upload Order

1. Upload `tds_deducted_gstr7_warnings.csv` as `TDS deducted`
2. Open `/returns`
3. Review the GSTR-7 readiness card
4. Prepare `GSTR-7`
5. Open `GSTR-7 Review`
6. Export `GSTR-7 XLSX`

### Expected Import Outcome

Expected:

- batch processes successfully
- `3` valid TDS rows are created

### Expected Readiness Warnings

Expected readiness status:

- `ready_with_warnings`

Expected warnings:

- `zero_tds_amount`
- `zero_payment_amount`
- `duplicate_tds_document_numbers`

Expected blocker count:

- `0`

Expected warning count:

- `3`

### Expected Prepared Snapshot Outcome

After preparing `GSTR-7`, the snapshot should show:

#### `tds_summary`

- `document_count` = `3`
- `deductee_count` = `2`
- `payment_amount` = `30000.00`
- `taxable_value` = `35000.00`
- `cgst_amount` = `50.00`
- `sgst_amount` = `50.00`
- `igst_amount` = `400.00`
- `tds_amount` = `500.00`

### Expected Review Page Outcome

On `/returns/gstr7-review`:

- `Warnings` tab should show all three warning signals
- `Tax Summary` should still show the prepared totals
- the page should not claim the return is blocked

### Expected Workbook Outcome

The workbook should still export successfully, and:

- `Validations` may remain empty if the warning is a readiness-level signal rather than a workbook-only validation
- `Summary`, `Deductees`, and `Source Rows` should still reflect the prepared monthly totals

### Pass Criteria

This case passes if:

- import succeeds
- GSTR-7 still prepares
- readiness shows the expected warning posture
- review page and workbook stay internally consistent
