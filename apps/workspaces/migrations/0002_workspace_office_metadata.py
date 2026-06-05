from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workspaces", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspace",
            name="address_line_1",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspace",
            name="address_line_2",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspace",
            name="city",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="workspace",
            name="contact_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="workspace",
            name="contact_phone",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="workspace",
            name="office_label",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspace",
            name="postal_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="workspace",
            name="state",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
    ]
