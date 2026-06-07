from apps.imports.services.parsers.advance_adjusted import AdvanceAdjustedImportParser
from apps.imports.services.parsers.advance_received import AdvanceReceivedImportParser
from apps.imports.services.parsers.credit_note import CreditNoteImportParser
from apps.imports.services.parsers.debit_note import DebitNoteImportParser
from apps.imports.services.parsers.gstr_2b import GSTR2BImportParser
from apps.imports.services.parsers.purchase import PurchaseImportParser
from apps.imports.services.parsers.sales import SalesImportParser
from apps.imports.services.parsers.tds_deducted import TDSDeductedImportParser

PARSER_REGISTRY = {
    "sales": SalesImportParser,
    "purchase": PurchaseImportParser,
    "credit_note": CreditNoteImportParser,
    "debit_note": DebitNoteImportParser,
    "tds_deducted": TDSDeductedImportParser,
    "advance_received": AdvanceReceivedImportParser,
    "advance_adjusted": AdvanceAdjustedImportParser,
    "gstr_2b": GSTR2BImportParser,
}
