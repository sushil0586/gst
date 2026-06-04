from apps.imports.services.parsers.base import BaseImportParser


class PurchaseImportParser(BaseImportParser):
    transaction_type = "purchase"
    default_document_type = "invoice"
    require_counterparty_gstin = True
