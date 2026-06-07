from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("returns", "0005_alter_returnpreparation_return_type_gstr9c"),
    ]

    operations = [
        migrations.AlterField(
            model_name="returnpreparation",
            name="return_type",
            field=models.CharField(
                choices=[
                    ("gstr1", "GSTR-1"),
                    ("gstr3b", "GSTR-3B"),
                    ("gstr7", "GSTR-7"),
                    ("gstr9", "GSTR-9"),
                    ("gstr9c", "GSTR-9C"),
                ],
                max_length=32,
            ),
        ),
    ]
