export const permissions = {
  viewClient: "view_client",
  manageClient: "manage_client",
  manageGstin: "manage_gstin",
  importData: "import_data",
  runReconciliation: "run_reconciliation",
  prepareReturn: "prepare_return",
  approveReturn: "approve_return",
  fileReturn: "file_return",
  manageUsers: "manage_users",
  viewAuditLog: "view_audit_log",
  manageSettings: "manage_settings",
} as const;

export function hasPermission(userPermissions: string[] | undefined, permissionCode: string) {
  if (!userPermissions || userPermissions.length === 0) {
    return false;
  }
  return userPermissions.includes(permissionCode);
}
