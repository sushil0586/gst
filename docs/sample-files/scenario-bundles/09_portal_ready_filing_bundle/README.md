# 09 Portal Ready Filing Bundle

Purpose:

- test the closest practical filing-grade scenario in the current product
- validate richer GSTR-1 workbook quality
- validate purchase + GSTR-2B reconciliation before GSTR-3B
- exercise notes, HSN, UQC, quantity, service flag, supply category, and e-commerce GSTIN

Files:

- `sales_portal_ready.csv`
- `sales_portal_ready.xlsx`
- `purchase_portal_ready.csv`
- `purchase_portal_ready.xlsx`
- `gstr_2b_portal_ready.csv`
- `credit_note_portal_ready.csv`
- `debit_note_portal_ready.csv`

Recommended upload order:

1. Upload `sales_portal_ready.csv` as `Sales`
2. Upload `purchase_portal_ready.csv` as `Purchase`
3. Upload `gstr_2b_portal_ready.csv` as `GSTR-2B`
4. Upload `credit_note_portal_ready.csv` as `Credit note`
5. Upload `debit_note_portal_ready.csv` as `Debit note`
6. Run `2B Reconciliation`
7. Open `Reports` and confirm filing metadata is present
8. Prepare GSTR-1
9. Prepare GSTR-3B
10. Export both workbooks

What this bundle is good for:

- best practical CA-facing demo with current data model
- reduced filing metadata warnings
- richer HSN summary
- note coverage in return export
- better workbook realism than the basic happy-path bundle

Important note:

This is the closest practical filing-grade sample in the current product, but it is still not a guarantee of exact government utility acceptance. The final acceptance depends on section-level workbook alignment and statutory completeness, not just source file richness.

Expected outcomes:

- imports should process successfully
- readiness should show fewer metadata-related warnings than the basic bundle
- reconciliation should produce a mix of matched and actionable purchase items
- GSTR-1 workbook should contain richer HSN and line-item detail
- GSTR-3B should prepare from both sales/purchase/reconciliation context
