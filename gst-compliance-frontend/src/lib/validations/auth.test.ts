import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validations/auth";

describe("auth validation schemas", () => {
  it("accepts valid login payloads", () => {
    const parsed = loginSchema.parse({
      email: "owner@example.com",
      password: "strong-pass-123",
    });

    expect(parsed.email).toBe("owner@example.com");
  });

  it("rejects invalid forgot-password emails", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects reset-password mismatched confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      password: "new-strong-pass",
      confirm_password: "different-pass",
    });

    expect(result.success).toBe(false);
  });

  it("rejects change-password mismatched confirmation", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "current-pass-123",
      new_password: "new-pass-123",
      confirm_new_password: "wrong-confirmation",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid registration payloads", () => {
    const result = registerSchema.safeParse({
      first_name: "Owner",
      last_name: "User",
      email: "owner@example.com",
      password: "strong-pass-123",
      organization_name: "Acme Compliance",
      workspace_name: "Primary Workspace",
      timezone: "Asia/Kolkata",
    });

    expect(result.success).toBe(true);
  });
});
