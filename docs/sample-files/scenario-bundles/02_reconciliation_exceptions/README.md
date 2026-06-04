# 02 Reconciliation Exceptions

Purpose:

- test reconciliation mismatch handling
- verify open issues are created correctly
- validate item review for matched and exception cases

Files:

- `purchase_reconciliation_exceptions.csv`
- `gstr_2b_reconciliation_exceptions.csv`

Recommended steps:

1. Upload the purchase file as `Purchase`
2. Upload the GSTR-2B file as `GSTR-2B`
3. Run reconciliation
4. Review items in `2B Reconciliation`

Expected examples:

- `P-3001` should match
- `P-3002` should show tax mismatch
- `P-3003` should be missing in portal
- `PX-3004` vs `P-3004` should act like a document-number mismatch style case
- `P-3999` should be missing in books

