from apps.imports.services.parsers.base import BaseImportParser


class GSTR2BImportParser(BaseImportParser):
    transaction_type = "gstr_2b"
    default_document_type = "invoice"
    require_counterparty_gstin = True
