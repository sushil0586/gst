import os

os.environ.setdefault("USE_SQLITE_FALLBACK", "True")
os.environ.setdefault("SECRET_KEY", "test-secret-key-with-32-plus-chars")
os.environ.setdefault("DEBUG", "True")
