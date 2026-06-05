from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gstins", "0003_gstintaxpayerprofile"),
    ]

    operations = [
        migrations.AlterField(
            model_name="gstin",
            name="gstin",
            field=models.CharField(max_length=15),
        ),
        migrations.AddConstraint(
            model_name="gstin",
            constraint=models.UniqueConstraint(fields=("client", "gstin"), name="unique_gstin_per_client"),
        ),
    ]
