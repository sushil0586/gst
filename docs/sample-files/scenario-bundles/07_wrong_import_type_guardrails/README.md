# 07 Wrong Import Type Guardrails

Purpose:

- verify filename-based import type protection
- confirm the UI/backend blocks obvious import-type mistakes

Files:

- `sales_register_wrong_type_test.csv`
- `purchase_register_wrong_type_test.csv`

Recommended steps:

1. Try uploading `sales_register_wrong_type_test.csv` with import type = `Purchase`
2. Try uploading `purchase_register_wrong_type_test.csv` with import type = `Sales`

Expected outcome:

- the upload should be blocked
- message should clearly say the file name looks like sales or purchase data and the selected import type is wrong

