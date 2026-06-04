# GST Compliance SaaS Pilot Runbook

## Local Setup

1. Create and activate the backend virtual environment:
   `python3 -m venv venv`
   `source venv/bin/activate`
2. Install backend dependencies:
   `pip install -r requirements.txt`
3. Apply migrations:
   `python manage.py migrate`
4. Seed demo data:
   `python manage.py seed_demo_data`
5. Start backend:
   `python manage.py runserver`
6. Start frontend:
   `cd gst-compliance-frontend`
   `npm install`
   `npm run dev`

## Login

- Demo admin:
  - Email: `demo_admin@example.com`
  - Password: `demo12345`

## Pilot Flow

1. Open the frontend and log in.
2. If needed, complete onboarding:
   - Create/select organization and workspace
   - Create client
   - Add GSTIN
   - Create compliance period
3. Go to `Imports` and upload sample files from `docs/sample-files/`:
   - `sales_sample.csv`
   - `purchase_sample.csv`
   - `gstr_2b_sample.csv`
4. Review row-level issues with `invalid_import_sample.csv`.
5. Open `Reconciliation` and run the GSTR-2B reconciliation engine.
6. Review mismatch items and assign or resolve actions.
7. Open `Returns`:
   - Prepare GSTR-1
   - Prepare GSTR-3B
8. Open `Approvals` or request approval from the returns detail.
9. Approve the return, mark it filed, then lock the compliance period.
10. Download reports from:
   - Transaction Review
   - Imports detail
   - Reconciliation
   - Returns
   - Audit Trail

## Recommended Smoke Check

- Dashboard shows real metrics for the selected workspace context.
- Monthly workspace page reflects import, reconciliation, return, approval, and lock status.
- Locked periods block new imports, reconciliation runs, and return preparation.
- Audit trail shows workflow actions after each step.
- XLSX exports download successfully even when datasets are empty.

## Known Limitations

- No GSTN portal sync or filing integration yet.
- No advanced reconciliation tuning beyond the Phase 1 matching rules.
- Return summaries are draft calculations for pilot workflows only.
- Approval assignment UI currently supports placeholder/manual reviewer selection.
- Exports are XLSX only in this phase.
