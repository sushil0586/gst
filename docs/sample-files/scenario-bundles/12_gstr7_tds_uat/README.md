# 12 GSTR-7 TDS UAT Bundle

Purpose:

- validate the current GSTR-7 MVP end to end
- exercise TDS deducted import, monthly preparation, review, and workbook export
- cover both a clean monthly case and a warning-focused case

Files:

- `tds_deducted_gstr7_main.csv`
- `tds_deducted_gstr7_warnings.csv`

Recommended usage:

### Clean case

1. Upload `tds_deducted_gstr7_main.csv` as `TDS deducted`
2. Prepare `GSTR-7`
3. Open `GSTR-7 Review`
4. Export the `GSTR-7` workbook

### Warning-focused case

1. Use a separate fresh period
2. Upload `tds_deducted_gstr7_warnings.csv` as `TDS deducted`
3. Prepare `GSTR-7`
4. Open `GSTR-7 Review`
5. Confirm warning signals for zero amounts and duplicate references

What this bundle is good for:

- deductee-wise grouping
- CGST/SGST and IGST TDS totals
- review page tab coverage
- readiness warning visibility
- workbook export coverage

Expected high-level outcomes:

- clean case prepares with no warnings
- warning case prepares with warnings but without blockers
- the review page and workbook use the same monthly totals

Important note:

- this bundle is intentionally limited to the current GSTR-7 MVP
- it does not assume a GSTR-7 filing flow yet
