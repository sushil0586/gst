from __future__ import annotations

import csv
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from openpyxl import Workbook


BASE_DIR = Path(__file__).resolve().parent.parent
SCENARIO_DIR = BASE_DIR / "docs" / "sample-files" / "scenario-bundles"
ZIP_DIR = BASE_DIR / "docs" / "sample-files" / "zips"

CSV_TO_XLSX = [
    SCENARIO_DIR / "01_happy_path_basic" / "sales_standard.csv",
    SCENARIO_DIR / "04_template_mapping_custom_headers" / "vendor_sales_custom_headers.csv",
    SCENARIO_DIR / "09_portal_ready_filing_bundle" / "sales_portal_ready.csv",
    SCENARIO_DIR / "09_portal_ready_filing_bundle" / "purchase_portal_ready.csv",
]


def csv_to_xlsx(csv_path: Path) -> Path:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for row in reader:
            sheet.append(row)
    xlsx_path = csv_path.with_suffix(".xlsx")
    workbook.save(xlsx_path)
    return xlsx_path


def build_zip_bundle(bundle_dir: Path) -> Path:
    ZIP_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = ZIP_DIR / f"{bundle_dir.name}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as bundle_zip:
        for file_path in sorted(bundle_dir.rglob("*")):
            if file_path.is_file():
                bundle_zip.write(file_path, arcname=f"{bundle_dir.name}/{file_path.relative_to(bundle_dir)}")
    return zip_path


def main() -> None:
    ZIP_DIR.mkdir(parents=True, exist_ok=True)
    for existing in ZIP_DIR.glob("*.zip"):
        existing.unlink()

    for csv_path in CSV_TO_XLSX:
        csv_to_xlsx(csv_path)

    generated = []
    for bundle_dir in sorted(path for path in SCENARIO_DIR.iterdir() if path.is_dir()):
        generated.append(build_zip_bundle(bundle_dir))

    print("Generated bundles:")
    for zip_path in generated:
        print(f"- {zip_path.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
