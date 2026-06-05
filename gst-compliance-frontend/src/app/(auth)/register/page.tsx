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
import { registerSchema, type RegisterSchema } from "@/lib/validations/auth";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useSession();
  const form = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      organization_name: "",
      workspace_name: "",
      timezone: "Asia/Kolkata",
    },
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await authService.register(values);
      queryClient.setQueryData(queryKeys.auth.me, user);
      toast.success("Workspace created successfully.");
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.16),transparent_24%),linear-gradient(to_bottom,#f8fafc,#eef2ff)] px-4 py-8">
      <Card className="w-full max-w-2xl border-slate-200/80 bg-white/95 py-0 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.35)]">
        <CardHeader className="space-y-4 border-b border-slate-100 px-6 py-6">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold text-slate-950">Create your GST workspace</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Register a new organization and workspace. You will become the workspace owner and can onboard your CA or filing team after setup.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" {...form.register("first_name")} />
                {form.formState.errors.first_name ? <p className="text-xs text-rose-600">{form.formState.errors.first_name.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" {...form.register("last_name")} />
                {form.formState.errors.last_name ? <p className="text-xs text-rose-600">{form.formState.errors.last_name.message}</p> : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email ? <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...form.register("password")} />
                {form.formState.errors.password ? <p className="text-xs text-rose-600">{form.formState.errors.password.message}</p> : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization_name">Organization name</Label>
                <Input id="organization_name" {...form.register("organization_name")} />
                {form.formState.errors.organization_name ? <p className="text-xs text-rose-600">{form.formState.errors.organization_name.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace_name">Workspace name</Label>
                <Input id="workspace_name" {...form.register("workspace_name")} />
                {form.formState.errors.workspace_name ? <p className="text-xs text-rose-600">{form.formState.errors.workspace_name.message}</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" {...form.register("timezone")} />
              {form.formState.errors.timezone ? <p className="text-xs text-rose-600">{form.formState.errors.timezone.message}</p> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="h-10 rounded-xl px-5" type="submit">
                {form.formState.isSubmitting ? "Creating..." : "Create workspace"}
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={() => router.push("/login")}>
                Back to sign in
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
