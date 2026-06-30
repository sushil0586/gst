from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("returns", "0008_portalchallanrequest"),
    ]

    operations = [
        migrations.AddField(
            model_name="portalledgersnapshot",
            name="cash_ledger_response",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
