from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.gst_transactions.services.follow_ups import process_due_follow_up_reminders

User = get_user_model()


class Command(BaseCommand):
    help = "Send due transaction remediation follow-up reminders and auto-escalate overdue assignments."

    def add_arguments(self, parser):
        parser.add_argument("--workspace", dest="workspace_id", help="Optional workspace UUID to limit reminder processing.")
        parser.add_argument(
            "--actor-username",
            dest="actor_username",
            help="Optional username to record as the reminder actor.",
        )

    def handle(self, *args, **options):
        actor = None
        if options["actor_username"]:
            actor = User.objects.filter(username=options["actor_username"]).first()
            if actor is None:
                raise CommandError("Actor username not found.")

        reminders = process_due_follow_up_reminders(
            actor=actor,
            workspace_id=options.get("workspace_id"),
        )
        self.stdout.write(self.style.SUCCESS(f"Processed {len(reminders)} due follow-up reminder(s)."))
