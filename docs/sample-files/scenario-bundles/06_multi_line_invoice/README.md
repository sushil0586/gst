# 06 Multi-Line Invoice

Purpose:

- test repeated invoice numbers with the same context
- confirm line items aggregate into one transaction
- validate line-item aware workbook behavior

Files:

- `sales_multi_line_invoice.csv`

Recommended steps:

1. Upload the file as `Sales`
2. Open `Reports`
3. Search for invoice `ML-7001`
4. Open the corrected transaction details
5. Review metadata line items

Expected outcome:

- multiple rows for `ML-7001` should aggregate into one transaction
- the transaction metadata should contain multiple line items
- the batch should not treat those rows as duplicate errors because the invoice context matches

