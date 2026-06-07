from apps.imports.services.parsers.base import BaseImportParser


class TDSDeductedImportParser(BaseImportParser):
    transaction_type = "tds_deducted"
    default_document_type = "tds_entry"
    require_counterparty_gstin = True
