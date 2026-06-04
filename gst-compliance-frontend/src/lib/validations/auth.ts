import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address."),
});

export const registerSchema = z.object({
  first_name: z.string().min(2, "Enter your first name."),
  last_name: z.string(),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  organization_name: z.string().min(2, "Enter your organization name."),
  workspace_name: z.string().min(2, "Enter your workspace name."),
  timezone: z.string().min(2, "Enter a valid timezone."),
});

export type LoginSchema = z.infer<typeof loginSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type RegisterSchema = z.infer<typeof registerSchema>;
