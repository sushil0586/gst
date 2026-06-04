# 03 Import Validation Failures

Purpose:

- test row-level validation errors
- test duplicate line detection
- test conflicting invoice context detection

Files:

- `invalid_values_sales.csv`
- `duplicate_lines_sales.csv`
- `conflicting_document_context_sales.csv`

Recommended steps:

1. Upload each file separately as `Sales`
2. Open the batch detail drawer
3. Review row errors

Expected outcome:

- invalid GSTIN and missing date errors
- invalid numeric value errors
- duplicate-in-file errors
- conflicting document context errors
- at least one file should still show partial valid processing

