import { z } from "zod";

export const organizationWorkspaceSchema = z.object({
  organization_name: z.string().min(2, "Organization name is required."),
  organization_code: z.string().min(2, "Organization code is required."),
  workspace_name: z.string().min(2, "Workspace name is required."),
  workspace_code: z.string().min(2, "Workspace code is required."),
  timezone: z.string().min(2, "Timezone is required."),
});

export type OrganizationWorkspaceValues = z.infer<typeof organizationWorkspaceSchema>;
