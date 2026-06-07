from apps.imports.services.parsers.base import BaseImportParser


class AdvanceAdjustedImportParser(BaseImportParser):
    transaction_type = "advance_adjusted"
    default_document_type = "advance_adjustment"
