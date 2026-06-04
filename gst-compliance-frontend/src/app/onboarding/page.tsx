"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { CheckCircle2, ChevronRight, Layers3, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/common/loading-state";
import { ProtectedRoute } from "@/components/common/protected-route";
import { useCreateClientMutation } from "@/features/clients";
import { useCreateCompliancePeriodMutation } from "@/features/compliance-periods";
import { useCreateGstinMutation, useSearchTaxpayerMutation } from "@/features/gstins";
import { useCreateOrganizationMutation, useCreateWorkspaceMutation } from "@/features/workspace";
import { getErrorMessage } from "@/lib/api/error-handler";
import { clientFormSchema, compliancePeriodFormSchema, gstinFormSchema, type ClientFormValues, type CompliancePeriodFormValues, type GstinFormValues } from "@/lib/validations/foundation";
import { organizationWorkspaceSchema, type OrganizationWorkspaceValues } from "@/lib/validations/onboarding";
import { useWorkspaceContext } from "@/store/workspace-context";

const steps = [
  "Organization & Workspace",
  "Client",
  "GSTIN",
  "Compliance Period",
  "Complete",
];

function buildSuggestedClientCode(legalName: string, pan: string) {
  const base = legalName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 4))
    .join("-");

  const panSuffix = pan.trim().toUpperCase().slice(-4);
  const parts = [base || "CLIENT", panSuffix].filter(Boolean);
  return parts.join("-").slice(0, 24);
}

function buildSuggestedClientEmail(legalName: string) {
  const slug = legalName
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join("");

  const localPart = slug || "client";
  return `finance@${localPart}.example.com`;
}

function StepShell({
  title,
  description,
  children,
  footer,
  aside,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="shrink-0 border-b border-slate-100 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Layers3 className="size-6" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-xl font-semibold text-slate-950">{title}</CardTitle>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between px-6 py-6">
        <div className="min-h-[320px] space-y-5">
          {children}
          {aside}
        </div>
        {footer ? <div className="mt-8 flex justify-end border-t border-slate-100 pt-5">{footer}</div> : null}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const {
    workspaces,
    selectedWorkspaceId,
    selectedClientId,
    selectedGstinId,
    setSelectedWorkspaceId,
    setSelectedClientId,
    setSelectedGstinId,
    setSelectedPeriodId,
    requiresOnboarding,
    isLoading,
  } = useWorkspaceContext();
  const [step, setStep] = useState(0);

  const createOrganizationMutation = useCreateOrganizationMutation();
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const createClientMutation = useCreateClientMutation(selectedWorkspaceId);
  const createGstinMutation = useCreateGstinMutation(selectedClientId);
  const searchTaxpayerMutation = useSearchTaxpayerMutation(selectedWorkspaceId);
  const createPeriodMutation = useCreateCompliancePeriodMutation(selectedGstinId);
  const [taxpayerLookupGstin, setTaxpayerLookupGstin] = useState("29ABCDE1234F1Z5");

  const workspaceForm = useForm<OrganizationWorkspaceValues>({
    resolver: zodResolver(organizationWorkspaceSchema),
    defaultValues: {
      organization_name: "Acme Compliance Group",
      organization_code: "ACMEGST",
      workspace_name: "Primary Workspace",
      workspace_code: "PRIMARY",
      timezone: "Asia/Kolkata",
    },
  });
  const clientForm = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      workspace: selectedWorkspaceId ?? "",
      legal_name: "Orion Retail Private Limited",
      trade_name: "Orion Retail",
      client_code: "ORION-001",
      pan: "ABCDE1234F",
      email: "finance@orion.example.com",
    },
  });
  const gstinForm = useForm<GstinFormValues>({
    resolver: zodResolver(gstinFormSchema),
    defaultValues: {
      client: selectedClientId ?? "",
      gstin: "29ABCDE1234F1Z5",
      registration_type: "regular",
      state_code: "29",
      whitebooks_gst_username: "",
    },
  });
  const periodForm = useForm<CompliancePeriodFormValues>({
    resolver: zodResolver(compliancePeriodFormSchema),
    defaultValues: {
      gstin: selectedGstinId ?? "",
      period: "2026-04",
      return_type: "GSTR-3B",
      status: "open",
      due_date: "2026-05-20",
    },
  });
  const registrationType = useWatch({
    control: gstinForm.control,
    name: "registration_type",
  });
  const returnType = useWatch({
    control: periodForm.control,
    name: "return_type",
  });
  const periodStatus = useWatch({
    control: periodForm.control,
    name: "status",
  });

  useEffect(() => {
    clientForm.setValue("workspace", selectedWorkspaceId ?? "");
  }, [clientForm, selectedWorkspaceId]);
  useEffect(() => {
    gstinForm.setValue("client", selectedClientId ?? "");
  }, [gstinForm, selectedClientId]);
  useEffect(() => {
    periodForm.setValue("gstin", selectedGstinId ?? "");
  }, [periodForm, selectedGstinId]);

  useEffect(() => {
    if (!isLoading && !requiresOnboarding) {
      router.replace("/dashboard");
    }
  }, [isLoading, requiresOnboarding, router]);

  const submitWorkspaceStep = workspaceForm.handleSubmit(async (values) => {
    try {
      if (workspaces.length > 0 && selectedWorkspaceId) {
        toast.success("Workspace selected.");
        setStep(1);
        return;
      }
      const organization = await createOrganizationMutation.mutateAsync({
        name: values.organization_name,
        code: values.organization_code,
      });
      const workspace = await createWorkspaceMutation.mutateAsync({
        organization: organization.id,
        name: values.workspace_name,
        code: values.workspace_code,
        timezone: values.timezone,
      });
      setSelectedWorkspaceId(workspace.id);
      toast.success("Workspace created successfully.");
      setStep(1);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  const submitClientStep = clientForm.handleSubmit(async (values) => {
    try {
      const client = await createClientMutation.mutateAsync({
        ...values,
        trade_name: values.trade_name ?? "",
        email: values.email ?? "",
      });
      setSelectedClientId(client.id);
      toast.success("Client created successfully.");
      setStep(2);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  const handleSearchTaxpayer = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select or create a workspace before searching taxpayer details.");
      return;
    }
    if (taxpayerLookupGstin.trim().length !== 15) {
      toast.error("Enter a valid 15-character GSTIN to search.");
      return;
    }
    try {
      const result = await searchTaxpayerMutation.mutateAsync({
        gstin: taxpayerLookupGstin.trim().toUpperCase(),
      });
      clientForm.setValue("legal_name", result.legal_name || clientForm.getValues("legal_name"), {
        shouldDirty: true,
      });
      clientForm.setValue("trade_name", result.trade_name || result.legal_name || "", {
        shouldDirty: true,
      });
      clientForm.setValue("pan", result.pan || clientForm.getValues("pan"), {
        shouldDirty: true,
      });
      if (!clientForm.getValues("client_code").trim()) {
        clientForm.setValue(
          "client_code",
          buildSuggestedClientCode(result.legal_name || result.trade_name || result.gstin, result.pan),
          { shouldDirty: true },
        );
      }
      if (!clientForm.getValues("email").trim()) {
        clientForm.setValue(
          "email",
          buildSuggestedClientEmail(result.legal_name || result.trade_name || result.gstin),
          { shouldDirty: true },
        );
      }
      gstinForm.setValue("gstin", result.gstin || taxpayerLookupGstin.trim().toUpperCase(), {
        shouldDirty: true,
      });
      gstinForm.setValue("state_code", result.state_code || gstinForm.getValues("state_code"), {
        shouldDirty: true,
      });
      if (result.registration_type) {
        gstinForm.setValue("registration_type", result.registration_type, {
          shouldDirty: true,
        });
      }
      toast.success("Taxpayer details fetched. Review and continue.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const submitGstinStep = gstinForm.handleSubmit(async (values) => {
    try {
      const gstin = await createGstinMutation.mutateAsync(values);
      setSelectedGstinId(gstin.id);
      toast.success("GSTIN created successfully.");
      setStep(3);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  const submitPeriodStep = periodForm.handleSubmit(async (values) => {
    try {
      const period = await createPeriodMutation.mutateAsync({
        ...values,
        due_date: values.due_date || null,
      });
      setSelectedPeriodId(period.id);
      toast.success("Compliance period created successfully.");
      setStep(4);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[linear-gradient(to_bottom,#f8fafc,#eef2ff)] px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <LoadingState message="Preparing onboarding..." />
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.12),transparent_22%),linear-gradient(to_bottom,#f8fafc,#eef2ff)]">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid items-stretch gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-full min-h-[560px] rounded-3xl border-slate-200/80 bg-[linear-gradient(180deg,#14213d_0%,#0f172a_100%)] py-0 text-white shadow-[0_32px_80px_-36px_rgba(15,23,42,0.65)]">
            <CardHeader className="border-b border-white/10 px-6 py-6">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                <ShieldCheck className="size-6 text-indigo-200" />
              </div>
              <CardTitle className="mt-4 text-xl font-semibold">Workspace onboarding</CardTitle>
              <p className="text-sm leading-6 text-slate-300">
                Complete the minimal operating setup once, then every future module has a stable context.
              </p>
            </CardHeader>
            <CardContent className="flex min-h-[396px] flex-col px-6 py-6">
              <div className="space-y-4">
                {steps.map((label, index) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ${index < step ? "bg-emerald-500 text-white" : index === step ? "bg-indigo-500 text-white" : "bg-white/10 text-slate-300"}`}>
                      {index < step ? <CheckCircle2 className="size-4" /> : index + 1}
                    </div>
                    <p className={`text-sm ${index <= step ? "text-white" : "text-slate-400"}`}>{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto rounded-2xl bg-white/8 px-4 py-4">
                <p className="text-sm font-medium text-white">Onboarding outcome</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This setup creates the minimum monthly workspace context so imports, reconciliation, returns, approvals, and exports stay aligned.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[560px] rounded-3xl border-slate-200/80 bg-white/95 py-0 shadow-[0_32px_80px_-36px_rgba(15,23,42,0.28)]">
              {step === 0 ? (
                <form onSubmit={submitWorkspaceStep}>
                  <StepShell
                    title={steps[step]}
                    description="Create the minimum operating setup needed to reach the monthly workspace."
                    footer={
                      <Button type="submit" className="h-11 min-w-36">
                        Continue <ChevronRight className="size-4" />
                      </Button>
                    }
                    aside={
                      workspaces.length > 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-4">
                          <p className="text-sm font-medium text-slate-900">Workspace tip</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            Switching the active workspace here only changes context. The onboarding layout will stay fixed while you compare options.
                          </p>
                        </div>
                      ) : null
                    }
                  >
                    {workspaces.length > 0 ? (
                      <div className="space-y-2">
                        <Label>Available workspaces</Label>
                        <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue placeholder="Select workspace" />
                          </SelectTrigger>
                          <SelectContent>
                            {workspaces.map((workspace) => (
                              <SelectItem key={workspace.id} value={workspace.id}>
                                {workspace.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="organization_name">Organization name</Label>
                            <Input id="organization_name" {...workspaceForm.register("organization_name")} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="organization_code">Organization code</Label>
                            <Input id="organization_code" {...workspaceForm.register("organization_code")} />
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="workspace_name">Workspace name</Label>
                            <Input id="workspace_name" {...workspaceForm.register("workspace_name")} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="workspace_code">Workspace code</Label>
                            <Input id="workspace_code" {...workspaceForm.register("workspace_code")} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="timezone">Timezone</Label>
                          <Input id="timezone" {...workspaceForm.register("timezone")} />
                        </div>
                      </>
                    )}
                  </StepShell>
                </form>
              ) : null}

              {step === 1 ? (
                <form onSubmit={submitClientStep}>
                  <StepShell
                    title={steps[step]}
                    description="Set up the first operating client that will own GSTINs, periods, imports, and returns."
                    footer={
                      <Button type="submit" className="h-11 min-w-36">
                        Create client <ChevronRight className="size-4" />
                      </Button>
                    }
                    aside={
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">GSTIN lookup assist</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Search taxpayer details from WhiteBooks and prefill the client and GSTIN setup before you create records.
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <Input
                            value={taxpayerLookupGstin}
                            onChange={(event) => setTaxpayerLookupGstin(event.target.value.toUpperCase())}
                            placeholder="Enter GSTIN"
                            maxLength={15}
                            className="bg-white"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="sm:min-w-40"
                            onClick={handleSearchTaxpayer}
                            disabled={searchTaxpayerMutation.isPending || !selectedWorkspaceId}
                          >
                            {searchTaxpayerMutation.isPending ? "Searching..." : "Fetch taxpayer"}
                          </Button>
                        </div>
                      </div>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="legal_name">Legal name</Label>
                        <Input id="legal_name" {...clientForm.register("legal_name")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="trade_name">Trade name</Label>
                        <Input id="trade_name" {...clientForm.register("trade_name")} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="client_code">Client code</Label>
                        <Input id="client_code" {...clientForm.register("client_code")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pan">PAN</Label>
                        <Input id="pan" {...clientForm.register("pan")} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" {...clientForm.register("email")} />
                    </div>
                  </StepShell>
                </form>
              ) : null}

              {step === 2 ? (
                <form onSubmit={submitGstinStep}>
                  <StepShell
                    title={steps[step]}
                    description="Register the GST identity that monthly imports, reconciliation, approvals, and returns will use."
                    footer={
                      <Button type="submit" className="h-11 min-w-36">
                        Create GSTIN <ChevronRight className="size-4" />
                      </Button>
                    }
                    aside={
                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">Format guidance</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Use the registered 15-character GSTIN. Long selection labels and values will truncate gracefully to keep the layout stable.
                        </p>
                      </div>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="gstin">GSTIN</Label>
                        <Input id="gstin" {...gstinForm.register("gstin")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state_code">State code</Label>
                        <Input id="state_code" {...gstinForm.register("state_code")} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Registration type</Label>
                      <Select
                        value={registrationType}
                        onValueChange={(value) => gstinForm.setValue("registration_type", value)}
                      >
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Regular</SelectItem>
                          <SelectItem value="composition">Composition</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whitebooks_gst_username">WhiteBooks GST username (optional)</Label>
                      <Input
                        id="whitebooks_gst_username"
                        {...gstinForm.register("whitebooks_gst_username")}
                        placeholder="Enter taxpayer GST username if available"
                      />
                      <p className="text-xs text-slate-500">
                        Optional now. You can continue onboarding and update it later before provider OTP authentication.
                      </p>
                    </div>
                  </StepShell>
                </form>
              ) : null}

              {step === 3 ? (
                <form onSubmit={submitPeriodStep}>
                  <StepShell
                    title={steps[step]}
                    description="Create the first monthly compliance period so the dashboard and workflow modules have a live operating window."
                    footer={
                      <Button type="submit" className="h-11 min-w-36">
                        Create period <ChevronRight className="size-4" />
                      </Button>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="period">Period</Label>
                        <Input id="period" {...periodForm.register("period")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="due_date">Due date</Label>
                        <Input id="due_date" type="date" {...periodForm.register("due_date")} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Return type</Label>
                        <Select value={returnType} onValueChange={(value) => periodForm.setValue("return_type", value)}>
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GSTR-3B">GSTR-3B</SelectItem>
                            <SelectItem value="GSTR-1">GSTR-1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={periodStatus} onValueChange={(value) => periodForm.setValue("status", value)}>
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </StepShell>
                </form>
              ) : null}

              {step === 4 ? (
                <StepShell
                  title={steps[step]}
                  description="The monthly workspace foundation is complete and ready for actual compliance operations."
                  footer={
                    <Button className="h-11 min-w-36" onClick={() => router.push("/dashboard")}>
                      Go to dashboard
                    </Button>
                  }
                >
                  <div className="rounded-3xl bg-[linear-gradient(135deg,#1e293b_0%,#312e81_50%,#4338ca_100%)] p-6 text-white">
                    <p className="text-sm text-indigo-100">Setup complete</p>
                    <h3 className="mt-2 text-2xl font-semibold">Your monthly workspace is ready</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">
                      You can now move into the dashboard and start working with imports, reconciliation, returns, and approvals as those modules come online.
                    </p>
                  </div>
                </StepShell>
              ) : null}
          </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
