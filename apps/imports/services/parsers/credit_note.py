from apps.imports.services.parsers.base import BaseImportParser


class CreditNoteImportParser(BaseImportParser):
    transaction_type = "credit_note"
    default_document_type = "credit_note"
    require_counterparty_gstin = True
