"use client";

import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/lib/auth/auth-service";
import { getErrorMessage } from "@/lib/api/error-handler";
import { changePasswordSchema, type ChangePasswordSchema } from "@/lib/validations/auth";

export default function ChangePasswordPage() {
  const form = useForm<ChangePasswordSchema>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_new_password: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await authService.changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      toast.success("Password changed successfully.");
      form.reset();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change password"
        description="Update your own workspace password using your current credentials."
      />

      <SectionCard
        title="Password update"
        description="Use a strong password that is not shared across customer or provider systems."
      >
        <form className="grid gap-4 md:max-w-xl" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="current_password">Current password</Label>
            <Input id="current_password" type="password" {...form.register("current_password")} />
            {form.formState.errors.current_password ? <p className="text-xs text-rose-600">{form.formState.errors.current_password.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input id="new_password" type="password" {...form.register("new_password")} />
            {form.formState.errors.new_password ? <p className="text-xs text-rose-600">{form.formState.errors.new_password.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_new_password">Confirm new password</Label>
            <Input id="confirm_new_password" type="password" {...form.register("confirm_new_password")} />
            {form.formState.errors.confirm_new_password ? (
              <p className="text-xs text-rose-600">{form.formState.errors.confirm_new_password.message}</p>
            ) : null}
          </div>
          <Button className="w-fit" type="submit">
            {form.formState.isSubmitting ? "Saving..." : "Change password"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
