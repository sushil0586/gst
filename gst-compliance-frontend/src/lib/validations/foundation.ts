import { z } from "zod";

export const clientFormSchema = z.object({
  workspace: z.string().min(1, "Workspace is required."),
  legal_name: z.string().min(2, "Legal name is required."),
  trade_name: z.string().optional(),
  client_code: z.string().min(2, "Client code is required."),
  pan: z.string().length(10, "PAN must be 10 characters."),
  email: z.email("Enter a valid email address.").or(z.literal("")),
  gstin: z.string().length(15, "GSTIN must be 15 characters.").or(z.literal("")).optional(),
  registration_type: z.string().optional(),
  state_code: z.string().length(2, "State code must be 2 characters.").or(z.literal("")).optional(),
  whitebooks_gst_username: z.string().optional(),
});

export const gstinFormSchema = z.object({
  client: z.string().min(1, "Client is required."),
  gstin: z.string().length(15, "GSTIN must be 15 characters."),
  registration_type: z.string().min(1, "Registration type is required."),
  state_code: z.string().min(2, "State code is required."),
  whitebooks_gst_username: z.string().optional(),
});

export const compliancePeriodFormSchema = z.object({
  gstin: z.string().min(1, "GSTIN is required."),
  period: z.string().min(7, "Period is required."),
  return_type: z.string().min(1, "Return type is required."),
  status: z.string().min(1, "Status is required."),
  due_date: z.string().optional(),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
export type GstinFormValues = z.infer<typeof gstinFormSchema>;
export type CompliancePeriodFormValues = z.infer<typeof compliancePeriodFormSchema>;
