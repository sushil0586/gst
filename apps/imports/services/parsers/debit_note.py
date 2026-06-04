from apps.imports.services.parsers.base import BaseImportParser


class DebitNoteImportParser(BaseImportParser):
    transaction_type = "debit_note"
    default_document_type = "debit_note"
    require_counterparty_gstin = True
