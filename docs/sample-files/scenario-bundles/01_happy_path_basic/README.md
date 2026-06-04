# 01 Happy Path Basic

Purpose:

- validate the basic import flow
- validate sales, purchase, and GSTR-2B processing
- prepare GSTR-1 and GSTR-3B
- run a simple reconciliation

Files:

- `sales_standard.csv`
- `sales_standard.xlsx`
- `purchase_standard.csv`
- `gstr_2b_standard.csv`

Recommended steps:

1. Open `Imports`
2. Select:
   - import type = `Sales`
   - source type = `CSV`
3. Upload `sales_standard.csv`
4. Upload `purchase_standard.csv` as `Purchase`
5. Upload `gstr_2b_standard.csv` as `GSTR-2B`
6. Optionally upload `sales_standard.xlsx` as `Sales` + `Excel`
7. Open `2B Reconciliation` and run reconciliation
8. Open `Returns` and prepare GSTR-1 and GSTR-3B

Expected outcome:

- all batches process successfully
- no row errors
- reconciliation produces mostly matched items
- returns can be prepared

