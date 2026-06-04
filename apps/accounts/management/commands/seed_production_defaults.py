from django.core.management.base import BaseCommand, CommandError

from apps.accounts.services.seeding import seed_production_defaults


class Command(BaseCommand):
    help = "Create idempotent production-oriented workspace defaults, rollout policies, and alert routing rules."

    def add_arguments(self, parser):
        parser.add_argument("--owner-email", required=True)
        parser.add_argument("--owner-password", required=True)
        parser.add_argument("--organization-name", default="Production Compliance Organization")
        parser.add_argument("--organization-code", default="PRODORG")
        parser.add_argument("--workspace-name", default="Production Workspace")
        parser.add_argument("--workspace-code", default="PROD-WS")
        parser.add_argument("--client-legal-name", default="Production Client Private Limited")
        parser.add_argument("--client-trade-name", default="Production Client")
        parser.add_argument("--client-code", default="PRODCLIENT")
        parser.add_argument("--pan", default="ABCDE1234P")
        parser.add_argument("--client-email", default="taxops@productionclient.example.com")
        parser.add_argument("--gstin", required=True)
        parser.add_argument("--state-code", required=True)
        parser.add_argument("--period", required=True, help="Format: YYYY-MM")
        parser.add_argument("--enable-live-submission", action="store_true")
        parser.add_argument("--enable-live-status-sync", action="store_true")

    def handle(self, *args, **options):
        gstin_value = options["gstin"].strip()
        state_code = options["state_code"].strip()
        period = options["period"].strip()
        if len(gstin_value) != 15:
            raise CommandError("GSTIN must be 15 characters.")
        if len(state_code) != 2:
            raise CommandError("State code must be 2 characters.")
        if len(period.split("-")) != 2:
            raise CommandError("Period must be in YYYY-MM format.")

        entity_graph = seed_production_defaults(
            owner_email=options["owner_email"].strip().lower(),
            owner_password=options["owner_password"],
            organization_name=options["organization_name"].strip(),
            organization_code=options["organization_code"].strip(),
            workspace_name=options["workspace_name"].strip(),
            workspace_code=options["workspace_code"].strip(),
            client_legal_name=options["client_legal_name"].strip(),
            client_trade_name=options["client_trade_name"].strip(),
            client_code=options["client_code"].strip(),
            pan=options["pan"].strip().upper(),
            client_email=options["client_email"].strip().lower(),
            gstin_value=gstin_value.upper(),
            state_code=state_code,
            period=period,
            enable_live_submission=bool(options["enable_live_submission"]),
            enable_live_status_sync=bool(options["enable_live_status_sync"]),
        )

        self.stdout.write(self.style.SUCCESS("Production defaults are ready."))
        self.stdout.write(f"Workspace: {entity_graph.workspace.name} ({entity_graph.workspace.code})")
        self.stdout.write(f"Client: {entity_graph.client.legal_name} ({entity_graph.client.client_code})")
        self.stdout.write(f"GSTIN: {entity_graph.gstin.gstin}")
        self.stdout.write(f"Periods: {entity_graph.gstr1_period.period} / {entity_graph.gstr3b_period.period}")
