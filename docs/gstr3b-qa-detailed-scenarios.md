# GSTR-3B QA Detailed Scenarios

## Scope

This detailed script expands the first GSTR-3B high-level case pack:

- `G3B-HL-001`
- `G3B-HL-002`
- `G3B-HL-003`
- `G3B-HL-004`

It is designed to run after the GSTR-1 extended UAT pack has already been completed for the same:

- workspace
- client
- GSTIN
- compliance period `2026-05`

## Related Files

- [gstr3b-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr3b-qa-high-level-checklist.md:1)
- [gstr1-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr1-qa-detailed-scenarios.md:1)
- [11_gstr3b_itc_reconciliation_uat/README.md](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/11_gstr3b_itc_reconciliation_uat/README.md:1)

## Bundle Used

- [purchase_gstr3b_itc_reconciliation.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/11_gstr3b_itc_reconciliation_uat/purchase_gstr3b_itc_reconciliation.csv)
- [gstr_2b_gstr3b_itc_reconciliation.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/11_gstr3b_itc_reconciliation_uat/gstr_2b_gstr3b_itc_reconciliation.csv)

## Detailed Case

## G3B-DT-001 Reconciliation And ITC Preparation On Top Of The GSTR-1 Extended Pack

### Objective

Prove that GSTR-3B works end to end for the same period after the GSTR-1 extended pack is already loaded, including:

- matched ITC
- pending review ITC
- pending 2B ITC
- vendor follow-up ITC
- blocked ITC
- outward tax liability reuse from the existing GSTR-1 sales and notes

### Preconditions

- the full GSTR-1 detailed scenario pack has already been uploaded and prepared in `2026-05`
- no older purchase or GSTR-2B files for this exact scenario remain active in the same context unless the tester intentionally reset the period
- outward GSTR-1 notes may still exist in the same period, but they should not appear in purchase vs GSTR-2B reconciliation

### Upload Order

1. Upload `purchase_gstr3b_itc_reconciliation.csv` as `Purchase`
2. Upload `gstr_2b_gstr3b_itc_reconciliation.csv` as `GSTR-2B`
3. Open reconciliation
4. Run `GSTR-2B Purchase` reconciliation
5. Review reconciliation items
6. Open `/returns`
7. Prepare `GSTR-3B`
8. Open the prepared return modal
9. Export the GSTR-3B workbook

### Expected Import Outcomes

#### File 1: `purchase_gstr3b_itc_reconciliation.csv`

Expected:

- batch processes successfully
- `4` valid purchase rows are created

#### File 2: `gstr_2b_gstr3b_itc_reconciliation.csv`

Expected:

- batch processes successfully
- `4` valid GSTR-2B rows are created

### Expected Reconciliation Outcomes

The completed reconciliation run should produce `5` effective review items:

- `P3B-9101` -> matched -> `itc_ready`
- `P3B-9102` -> tax mismatch -> `itc_pending_review`
- `P3B-9103` -> missing in portal -> `itc_pending_2b`
- `P3B-9104` paired with `PX-9104` -> document mismatch -> `itc_vendor_followup_required`
- `P3B-9199` -> missing in books -> `itc_blocked`

It should not produce extra purchase-side reconciliation rows for:

- `CN-4001`
- `CN-A-4002`
- `DN-5001`

Expected run-level counts:

- `matched_count` = `1`
- `mismatch_count` = `2`
- `missing_in_books_count` = `1`
- `missing_in_portal_count` = `1`
- `duplicate_count` = `0`
- `itc_ready_count` = `1`
- `itc_pending_2b_count` = `1`
- `itc_pending_review_count` = `1`
- `itc_blocked_count` = `1`
- `itc_vendor_followup_required_count` = `1`
- `itc_timing_difference_count` = `0`

### Expected GSTR-3B ITC Summary

After preparing `GSTR-3B`, the prepared `itc_summary` should show:

- `books_itc` = `13500.00`
- `reflected_itc` = `12960.00`
- `claim_ready_itc` = `5400.00`
- `pending_2b_itc` = `1800.00`
- `pending_review_itc` = `3420.00`
- `blocked_itc` = `1440.00`
- `timing_difference_itc` = `0.00`
- `vendor_followup_required_itc` = `2700.00`
- `eligible_itc` = `5400.00`
- `itc_at_risk` = `9360.00`
- `deferred_blocked_itc` = `0.00`
- `unresolved_mismatch_count` = `4`
- `claim_ready_count` = `1`
- `pending_2b_count` = `1`
- `pending_review_count` = `1`
- `blocked_count` = `1`
- `timing_difference_count` = `0`
- `vendor_followup_required_count` = `1`

### Expected GSTR-3B Outward Summary

Because this case is meant to run after the GSTR-1 extended bundle, the prepared `outward_supplies` should reflect the already-loaded outward books:

- `outward_taxable_value` = `787000.00`
- `outward_tax_liability` = `141660.00`

Expected computed payment result:

- `net_tax_payable` = `136260.00`

### Expected Returns UI Outcomes

On `/returns`, after opening the prepared GSTR-3B return:

- taxable value should show `787000.00`
- tax amount / outward liability should show `141660.00`
- ITC impact should show `5400.00`
- net payable should show `136260.00`

### Expected Workbook Outcomes

The exported GSTR-3B workbook should show:

- outward tax liability using the same prepared outward numbers
- eligible ITC = `5400.00`
- ITC at risk = `9360.00`
- blocked ITC = `1440.00`
- pending review ITC = `3420.00`
- pending in 2B ITC = `1800.00`
- vendor follow-up ITC = `2700.00`
- unresolved mismatch count = `4`
- net tax payable = `136260.00`

### Pass Criteria

The case passes if:

- both imports succeed
- reconciliation creates the expected five item patterns
- GSTR-3B preparation succeeds
- ITC and net-payable totals match the expected values above
- workbook and UI show the same claim-ready and at-risk ITC picture
