from django.core.management.base import BaseCommand

from apps.accounts.services.seeding import seed_entity_graph
from apps.audit_logs.models import AuditLog


class Command(BaseCommand):
    help = "Create idempotent demo data for local onboarding and UI testing."

    def handle(self, *args, **options):
        entity_graph = seed_entity_graph(
            owner_email="demo_admin@example.com",
            owner_password="demo12345",
            owner_username="demo_admin",
            owner_first_name="Demo",
            owner_last_name="Admin",
            owner_is_staff=True,
            owner_is_superuser=True,
            organization_name="Demo Compliance Organization",
            organization_code="DEMOORG",
            workspace_name="Demo Workspace",
            workspace_code="DEMO-WS",
            client_legal_name="Demo Client Private Limited",
            client_trade_name="Demo Client",
            client_code="DEMOCLIENT",
            pan="ABCDE1234F",
            client_email="accounts@democlient.example.com",
            gstin_value="29ABCDE1234F1Z5",
            state_code="29",
            period="2026-04",
        )

        AuditLog.objects.get_or_create(
            actor=entity_graph.owner_user,
            action="demo.seeded",
            entity_type="Workspace",
            entity_id=entity_graph.workspace.id,
            defaults={
                "workspace_id_ref": entity_graph.workspace.id,
                "client_id_ref": entity_graph.client.id,
                "metadata": {"source": "seed_demo_data"},
                "created_by": entity_graph.owner_user,
                "updated_by": entity_graph.owner_user,
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data is ready."))
        self.stdout.write("Login email: demo_admin@example.com")
        self.stdout.write("Login password: demo12345")
