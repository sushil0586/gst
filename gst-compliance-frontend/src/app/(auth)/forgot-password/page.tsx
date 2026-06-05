"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { authService } from "@/lib/auth/auth-service";
import { getErrorMessage } from "@/lib/api/error-handler";
import { forgotPasswordSchema, type ForgotPasswordSchema } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await authService.forgotPassword(values);
      toast.success("If your account exists, a password reset link has been sent.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_24%),linear-gradient(to_bottom,#f8fafc,#ecfeff)] px-4">
      <Card className="w-full max-w-md border-slate-200/80 bg-white/95 py-0 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.35)]">
        <CardHeader className="space-y-4 border-b border-slate-100 px-6 py-6">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <MailCheck className="size-6" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold text-slate-950">Reset access</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter your workspace email and we will send a secure password reset link if your account exists.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <Button className="h-10 w-full rounded-xl" type="submit">
              {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
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
