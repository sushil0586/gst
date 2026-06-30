from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("returns", "0009_portalledgersnapshot_cash_ledger_response"),
    ]

    operations = [
        migrations.AddField(
            model_name="portalledgersnapshot",
            name="itc_ledger_response",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="portalledgersnapshot",
            name="liability_ledger_response",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
