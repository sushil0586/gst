# GSTR-3B QA High-Level Checklist

Use this after the GSTR-1 extended UAT pack has already been completed in the same period.

## Scope

- purchase import
- GSTR-2B import
- reconciliation
- GSTR-3B preparation
- returns UI review
- workbook export review

## Related Files

- [gstr3b-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr3b-qa-detailed-scenarios.md:1)
- [11_gstr3b_itc_reconciliation_uat/README.md](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/11_gstr3b_itc_reconciliation_uat/README.md:1)

## High-Level Cases

### `G3B-HL-001 Purchase And 2B Import`

Validate that the new purchase and GSTR-2B files import successfully in the same period used for the GSTR-1 pack.

### `G3B-HL-002 Reconciliation Bucket Coverage`

Validate that reconciliation produces:

- matched
- tax mismatch / pending review
- missing in portal / pending 2B
- document mismatch / vendor follow-up
- missing in books / blocked ITC

### `G3B-HL-003 GSTR-3B Return Preparation`

Validate that the prepared GSTR-3B summary uses:

- outward supplies from the already-imported GSTR-1 sales and notes
- ITC from the completed reconciliation run

### `G3B-HL-004 UI And Workbook Review`

Validate that `/returns`, the return modal, and exported GSTR-3B workbook show the expected ITC and net-payable numbers.
