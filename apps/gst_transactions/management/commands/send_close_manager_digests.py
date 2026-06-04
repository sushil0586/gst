from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.gst_transactions.services.digests import generate_scheduled_remediation_digests

User = get_user_model()


class Command(BaseCommand):
    help = "Generate and dispatch scheduled close-manager digests for workspace members."

    def add_arguments(self, parser):
        parser.add_argument("--workspace", dest="workspace_id", help="Optional workspace UUID to limit digest generation.")
        parser.add_argument(
            "--delivery-channel",
            dest="delivery_channel",
            choices=["in_app", "email_preview", "email"],
            help="Override the configured delivery channel for this run.",
        )
        parser.add_argument(
            "--actor-username",
            dest="actor_username",
            help="Optional username to record as the generating actor.",
        )

    def handle(self, *args, **options):
        actor = None
        if options["actor_username"]:
            actor = User.objects.filter(username=options["actor_username"]).first()
            if actor is None:
                raise CommandError("Actor username not found.")

        digests = generate_scheduled_remediation_digests(
            actor=actor,
            workspace_id=options.get("workspace_id"),
            delivery_channel=options.get("delivery_channel"),
        )
        self.stdout.write(self.style.SUCCESS(f"Generated {len(digests)} close-manager digest(s)."))
