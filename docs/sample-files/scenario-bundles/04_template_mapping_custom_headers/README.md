# 04 Template Mapping Custom Headers

Purpose:

- test the create-template workflow
- test non-standard headers
- test saved template reuse
- test Excel header detection

Files:

- `vendor_sales_custom_headers.csv`
- `vendor_sales_custom_headers.xlsx`

Recommended steps:

1. Open `Imports`
2. Choose `Sales`
3. Open `Create template`
4. Use this file to map custom headers
5. Save the template
6. Upload again using the saved template

Suggested mappings:

- `inv_no` -> `document_number`
- `bill_date` -> `document_date`
- `customer_gstin` -> `counterparty_gstin`
- `customer_name` -> `counterparty_name`
- `assessable_value` -> `taxable_value`
- `invoice_value` -> `total_amount`
- `hsn_sac` -> `hsn_code`
- `unit` -> `uqc`
- `total_qty` -> `quantity`
- `service` -> `is_service`
- `gst_supply_type` -> `supply_category`
- `operator_gstin` -> `ecommerce_gstin`

Expected outcome:

- template saves successfully
- warning about incomplete filing metadata should disappear once the optional fields are mapped

