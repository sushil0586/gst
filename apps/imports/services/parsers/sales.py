from apps.imports.services.parsers.base import BaseImportParser


class SalesImportParser(BaseImportParser):
    transaction_type = "sales"
    default_document_type = "invoice"
