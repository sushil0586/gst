from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("imports", "0007_alter_importbatch_import_type_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="importbatch",
            name="import_type",
            field=models.CharField(
                choices=[
                    ("sales", "Sales"),
                    ("purchase", "Purchase"),
                    ("credit_note", "Credit Note"),
                    ("debit_note", "Debit Note"),
                    ("tds_deducted", "TDS Deducted"),
                    ("advance_received", "Advance Received"),
                    ("advance_adjusted", "Advance Adjusted"),
                    ("gstr_2b", "GSTR-2B"),
                ],
                default="sales",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="importtemplate",
            name="import_type",
            field=models.CharField(
                choices=[
                    ("sales", "Sales"),
                    ("purchase", "Purchase"),
                    ("credit_note", "Credit Note"),
                    ("debit_note", "Debit Note"),
                    ("tds_deducted", "TDS Deducted"),
                    ("advance_received", "Advance Received"),
                    ("advance_adjusted", "Advance Adjusted"),
                    ("gstr_2b", "GSTR-2B"),
                ],
                max_length=32,
            ),
        ),
    ]
