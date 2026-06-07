from apps.imports.services.parsers.base import BaseImportParser


class AdvanceReceivedImportParser(BaseImportParser):
    transaction_type = "advance_received"
    default_document_type = "receipt_voucher"
