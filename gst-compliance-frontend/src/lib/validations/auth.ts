import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address."),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm_password: z.string().min(8, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(8, "Current password must be at least 8 characters."),
    new_password: z.string().min(8, "New password must be at least 8 characters."),
    confirm_new_password: z.string().min(8, "Confirm your new password."),
  })
  .refine((values) => values.new_password === values.confirm_new_password, {
    message: "Passwords do not match.",
    path: ["confirm_new_password"],
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
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
export type RegisterSchema = z.infer<typeof registerSchema>;
