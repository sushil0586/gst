"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { CheckCircle2, ChevronRight, Layers3, ShieldCheck, Sparkles } from "lucide-react";
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
import { GST_REGISTRATION_TYPE_OPTIONS, normalizeRegistrationType } from "@/lib/constants/gst-registration-types";
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

function buildCurrentPeriodLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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
  const [showFreshWorkspaceBanner, setShowFreshWorkspaceBanner] = useState(false);

  const createOrganizationMutation = useCreateOrganizationMutation();
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const createClientMutation = useCreateClientMutation(selectedWorkspaceId);
  const createGstinMutation = useCreateGstinMutation(selectedClientId);
  const searchTaxpayerMutation = useSearchTaxpayerMutation(selectedWorkspaceId);
  const createPeriodMutation = useCreateCompliancePeriodMutation(selectedGstinId);
  const [taxpayerLookupGstin, setTaxpayerLookupGstin] = useState("");

  const workspaceForm = useForm<OrganizationWorkspaceValues>({
    resolver: zodResolver(organizationWorkspaceSchema),
    defaultValues: {
      organization_name: "",
      organization_code: "",
      workspace_name: "",
      workspace_code: "",
      timezone: "Asia/Kolkata",
    },
  });
  const clientForm = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      workspace: selectedWorkspaceId ?? "",
      legal_name: "",
      trade_name: "",
      client_code: "",
      pan: "",
      email: "",
    },
  });
  const gstinForm = useForm<GstinFormValues>({
    resolver: zodResolver(gstinFormSchema),
    defaultValues: {
      client: selectedClientId ?? "",
      gstin: "",
      registration_type: "regular",
      state_code: "",
      whitebooks_gst_username: "",
    },
  });
  const periodForm = useForm<CompliancePeriodFormValues>({
    resolver: zodResolver(compliancePeriodFormSchema),
    defaultValues: {
      gstin: selectedGstinId ?? "",
      period: buildCurrentPeriodLabel(),
      return_type: "GSTR-3B",
      status: "open",
      due_date: "",
    },
  });
  const clientLegalName = useWatch({
    control: clientForm.control,
    name: "legal_name",
  });
  const clientPan = useWatch({
    control: clientForm.control,
    name: "pan",
  });
  const gstinValue = useWatch({
    control: gstinForm.control,
    name: "gstin",
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
  const isWorkspaceCreated = workspaces.length > 0;
  const isFoundationSetup = step >= 1 || isWorkspaceCreated;
  const onboardingHeading = isFoundationSetup ? "First client setup" : "Workspace onboarding";
  const onboardingDescription = isFoundationSetup
    ? "Your CA workspace is ready. Now set up the first client, GSTIN, and period that monthly work will run on."
    : "Create the minimum operating setup once so every future module has a stable context.";

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
    if (step === 0 && workspaces.length === 1 && selectedWorkspaceId) {
      setStep(1);
    }
  }, [selectedWorkspaceId, step, workspaces.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isFreshWorkspaceSetup = params.get("setup") === "workspace-created";
    if (!isFreshWorkspaceSetup) {
      return;
    }
    setShowFreshWorkspaceBanner(true);
    params.delete("setup");
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!clientLegalName?.trim()) {
      return;
    }
    if (!clientForm.getValues("client_code").trim() && clientPan.trim().length >= 4) {
      clientForm.setValue("client_code", buildSuggestedClientCode(clientLegalName, clientPan));
    }
    if (!clientForm.getValues("email").trim()) {
      clientForm.setValue("email", buildSuggestedClientEmail(clientLegalName));
    }
  }, [clientForm, clientLegalName, clientPan]);

  useEffect(() => {
    const normalizedGstin = gstinValue.trim().toUpperCase();
    if (normalizedGstin.length >= 2 && !gstinForm.getValues("state_code").trim()) {
      gstinForm.setValue("state_code", normalizedGstin.slice(0, 2));
    }
  }, [gstinForm, gstinValue]);

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
        gstinForm.setValue("registration_type", normalizeRegistrationType(result.registration_type), {
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
                {onboardingDescription}
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
                  This creates the first live operating context for your CA workspace so imports, reconciliation, returns, approvals, notices, and follow-ups stay aligned.
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
                    description="Create the first client for this workspace. You can fetch taxpayer details first, or enter the basics manually and continue."
                    footer={
                      <Button type="submit" className="h-11 min-w-36">
                        Create client <ChevronRight className="size-4" />
                      </Button>
                    }
                    aside={
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">Workspace ready</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Your organization and workspace are already set up. Add the first client below so returns, notices, follow-ups, and reports have a real working context.
                        </p>
                        <div className="my-4 border-t border-indigo-100" />
                        <p className="text-sm font-medium text-slate-900">GSTIN lookup assist</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Search taxpayer details from the connected filing channel and prefill the client and GSTIN setup before you create records.
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <Input
                            value={taxpayerLookupGstin}
                            onChange={(event) => setTaxpayerLookupGstin(event.target.value.toUpperCase())}
                            placeholder="Enter GSTIN to prefill client details"
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
                    {showFreshWorkspaceBanner ? (
                      <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(224,231,255,0.9))] px-4 py-4 shadow-[0_18px_40px_-30px_rgba(16,185,129,0.45)]">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-3">
                            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                              <Sparkles className="size-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-950">Workspace created successfully</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                The core workspace is ready. Add your first client now so GSTIN setup, imports, returns, notices, and follow-ups can start from a real business context.
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-slate-500 hover:text-slate-700"
                            onClick={() => setShowFreshWorkspaceBanner(false)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">What this step is</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        This is not personal CA onboarding. You are now setting up the first working client inside the workspace so the filing team has a real business context to operate on.
                      </p>
                    </div>
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
                      <Input id="email" {...clientForm.register("email")} placeholder="finance@client.example.com" />
                    </div>
                  </StepShell>
                </form>
              ) : null}

              {step === 2 ? (
                <form onSubmit={submitGstinStep}>
                  <StepShell
                    title={steps[step]}
                    description="Add the first GSTIN for this client. This can be completed now or finished later from the workspace registers."
                    footer={
                      <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" className="h-11 min-w-36" onClick={() => router.push("/dashboard")}>
                          Finish later
                        </Button>
                        <Button type="submit" className="h-11 min-w-36">
                          Create GSTIN <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    }
                    aside={
                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">Workspace setup note</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          You already created the CA workspace. This step only adds the client’s GST registration so return preparation and filing can be scoped correctly.
                        </p>
                        <div className="my-4 border-t border-slate-200" />
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
                        <Input id="gstin" {...gstinForm.register("gstin")} placeholder="Enter the registered GSTIN" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state_code">State code</Label>
                        <Input id="state_code" {...gstinForm.register("state_code")} placeholder="Auto-filled from GSTIN when available" />
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
                          {GST_REGISTRATION_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whitebooks_gst_username">Customer GST portal username (Recommended)</Label>
                      <Input
                        id="whitebooks_gst_username"
                        {...gstinForm.register("whitebooks_gst_username")}
                        placeholder="Enter the customer's GST portal username"
                      />
                      <p className="text-xs text-slate-500">
                        Recommended for smoother filing access. You can continue onboarding now and update this later if needed.
                      </p>
                    </div>
                  </StepShell>
                </form>
              ) : null}

              {step === 3 ? (
                <form onSubmit={submitPeriodStep}>
                  <StepShell
                    title={steps[step]}
                    description="Create the first working period for this client. You can do it now or continue to the dashboard and create periods later."
                    footer={
                      <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" className="h-11 min-w-36" onClick={() => router.push("/dashboard")}>
                          Finish later
                        </Button>
                        <Button type="submit" className="h-11 min-w-36">
                          Create period <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    }
                  >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">Why period setup matters</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Periods are what monthly filing work actually runs on. If you skip this now, you can still enter the dashboard and create periods later from the compliance-period register.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="period">Period</Label>
                        <Input id="period" {...periodForm.register("period")} placeholder="YYYY-MM" />
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
