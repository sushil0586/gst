from apps.accounts.models import WorkspaceRole

PERMISSIONS = {
    "view_client": "View clients",
    "manage_client": "Manage clients",
    "manage_gstin": "Manage GSTINs",
    "import_data": "Import data",
    "run_reconciliation": "Run reconciliation",
    "prepare_return": "Prepare returns",
    "approve_return": "Approve returns",
    "file_return": "File returns",
    "manage_users": "Manage users",
    "view_audit_log": "View audit logs",
    "manage_settings": "Manage settings",
}

ROLE_PERMISSION_MAP = {
    WorkspaceRole.OWNER: set(PERMISSIONS.keys()),
    WorkspaceRole.ADMIN: set(PERMISSIONS.keys()),
    WorkspaceRole.MANAGER: {
        "view_client",
        "manage_client",
        "manage_gstin",
        "import_data",
        "run_reconciliation",
        "prepare_return",
        "approve_return",
        "view_audit_log",
    },
    WorkspaceRole.ACCOUNTANT: {
        "view_client",
        "manage_client",
        "manage_gstin",
        "import_data",
        "run_reconciliation",
        "prepare_return",
    },
    WorkspaceRole.REVIEWER: {
        "view_client",
        "run_reconciliation",
        "prepare_return",
        "approve_return",
        "view_audit_log",
    },
    WorkspaceRole.FILER: {
        "view_client",
        "prepare_return",
        "file_return",
    },
    WorkspaceRole.SENIOR_CA: {
        "view_client",
        "prepare_return",
        "approve_return",
        "file_return",
        "view_audit_log",
    },
    WorkspaceRole.VIEWER: {
        "view_client",
        "view_audit_log",
    },
}
