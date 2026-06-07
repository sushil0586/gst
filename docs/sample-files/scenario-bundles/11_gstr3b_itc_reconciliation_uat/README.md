# 11 GSTR-3B ITC Reconciliation UAT

Purpose:

- extend the `10_gstr1_extended_sections_uat` scenario into GSTR-3B
- validate purchase vs GSTR-2B reconciliation behavior
- validate ITC buckets used by GSTR-3B preparation
- validate the GSTR-3B return after the GSTR-1 sales bundle is already present in the same period

Use this bundle after:

- [gstr1-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr1-qa-detailed-scenarios.md:1)

Files:

- `purchase_gstr3b_itc_reconciliation.csv`
- `gstr_2b_gstr3b_itc_reconciliation.csv`

Recommended upload order:

1. keep the same workspace, client, GSTIN, and period used for the GSTR-1 extended UAT pack
2. upload `purchase_gstr3b_itc_reconciliation.csv` as `Purchase`
3. upload `gstr_2b_gstr3b_itc_reconciliation.csv` as `GSTR-2B`
4. run reconciliation
5. prepare `GSTR-3B`
6. review the return, reconciliation summary, and workbook

Expected examples:

- `P3B-9101` should match and become claim-ready ITC
- `P3B-9102` should show a tax mismatch and land in pending review
- `P3B-9103` should be missing in portal and land in pending 2B
- `P3B-9104` vs `PX-9104` should behave like a document mismatch and land in vendor follow-up
- `P3B-9199` should be missing in books and land in blocked ITC

Important reconciliation rule:

- outward GSTR-1 credit notes and debit notes from the same period may still affect GSTR-3B outward liability
- but they should not appear as purchase-side ITC reconciliation rows in this bundle
