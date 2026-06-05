"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { authService } from "@/lib/auth/auth-service";
import { getErrorMessage } from "@/lib/api/error-handler";
import { resetPasswordSchema, type ResetPasswordSchema } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirm_password: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!uid || !token) {
      toast.error("Password reset link is incomplete or invalid.");
      return;
    }

    try {
      await authService.resetPassword({ uid, token, password: values.password });
      toast.success("Password reset successful. Please sign in with your new password.");
      router.push("/login");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.16),transparent_24%),linear-gradient(to_bottom,#f8fafc,#eef2ff)] px-4">
      <Card className="w-full max-w-md border-slate-200/80 bg-white/95 py-0 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.35)]">
        <CardHeader className="space-y-4 border-b border-slate-100 px-6 py-6">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold text-slate-950">Choose a new password</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Set a new password for your workspace account.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" {...form.register("password")} />
              {form.formState.errors.password ? <p className="text-xs text-rose-600">{form.formState.errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input id="confirm_password" type="password" {...form.register("confirm_password")} />
              {form.formState.errors.confirm_password ? (
                <p className="text-xs text-rose-600">{form.formState.errors.confirm_password.message}</p>
              ) : null}
            </div>
            <Button className="h-10 w-full rounded-xl" type="submit">
              {form.formState.isSubmitting ? "Updating..." : "Reset password"}
            </Button>
          </form>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.16),transparent_24%),linear-gradient(to_bottom,#f8fafc,#eef2ff)]" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
