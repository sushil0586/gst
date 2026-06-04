"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/lib/auth/auth-service";
import { getErrorMessage } from "@/lib/api/error-handler";
import { queryKeys } from "@/lib/query/query-keys";
import { useSession } from "@/lib/query/session-provider";
import { loginSchema, type LoginSchema } from "@/lib/validations/auth";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useSession();
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@example.com",
      password: "strong-pass-123",
    },
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await authService.login(values.email, values.password);
      queryClient.setQueryData(queryKeys.auth.me, user);
      toast.success("Signed in successfully.");
      router.push("/dashboard");
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
            <CardTitle className="text-2xl font-semibold text-slate-950">Welcome back</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Access the GST compliance workspace with your team credentials.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...form.register("password")} />
              {form.formState.errors.password ? (
                <p className="text-xs text-rose-600">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <Button className="h-10 w-full rounded-xl" type="submit">
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/register")}>
              Create a new workspace
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/forgot-password")}>
              Forgot your password?
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
