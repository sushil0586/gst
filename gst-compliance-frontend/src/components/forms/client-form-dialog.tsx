"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { ActionLabel } from "@/components/common/action-label";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBootstrapClientMutation, useClientsQuery, useCreateClientMutation, useUpdateClientMutation } from "@/features/clients";
import { useSearchTaxpayerMutation } from "@/features/gstins";
import { GST_REGISTRATION_TYPE_OPTIONS, normalizeRegistrationType } from "@/lib/constants/gst-registration-types";
import { getErrorMessage, getFieldErrors } from "@/lib/api/error-handler";
import { clientFormSchema, type ClientFormValues } from "@/lib/validations/foundation";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { ClientRecord, GSTINTaxpayerSearchResult, WorkspaceRecord } from "@/types/api";

function getInitialClientFormValues(
  initialValues?: ClientRecord | null,
  workspaces: WorkspaceRecord[] = [],
): ClientFormValues {
  return {
    workspace: initialValues?.workspace ?? workspaces[0]?.id ?? "",
    legal_name: initialValues?.legal_name ?? "",
    trade_name: initialValues?.trade_name ?? "",
    client_code: initialValues?.client_code ?? "",
    pan: initialValues?.pan ?? "",
    email: initialValues?.email ?? "",
    gstin: "",
    registration_type: "regular",
    state_code: "",
    whitebooks_gst_username: "",
  };
}

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

function buildUniqueClientCode(baseCode: string, existingCodes: string[], reservedCode?: string) {
  const normalizedBase = baseCode.trim().toUpperCase().slice(0, 64) || "CLIENT";
  const existingSet = new Set(
    existingCodes
      .filter((code) => code && code !== reservedCode)
      .map((code) => code.trim().toUpperCase()),
  );
  if (!existingSet.has(normalizedBase)) {
    return normalizedBase;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${normalizedBase}${suffix}`.slice(0, 64);
    if (!existingSet.has(candidate)) {
      return candidate;
    }
  }
  return `${normalizedBase}-${Date.now().toString().slice(-4)}`.slice(0, 64);
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

  return `finance@${slug || "client"}.example.com`;
}

export function ClientFormDialog({
  open,
  onOpenChange,
  workspaces,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceRecord[];
  initialValues?: ClientRecord | null;
}) {
  const dialogIdentity = `${initialValues?.id ?? "new"}:${initialValues?.workspace ?? workspaces[0]?.id ?? "none"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ClientFormDialogContent
        key={dialogIdentity}
        onOpenChange={onOpenChange}
        workspaces={workspaces}
        initialValues={initialValues}
      />
    </Dialog>
  );
}

function ClientFormDialogContent({
  onOpenChange,
  workspaces,
  initialValues,
}: {
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceRecord[];
  initialValues?: ClientRecord | null;
}) {
  const initialFormValues = getInitialClientFormValues(initialValues, workspaces);
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: initialFormValues,
  });
  const workspaceId = useWatch({ control: form.control, name: "workspace" });
  const { setSelectedClientId, setSelectedGstinId } = useWorkspaceContext();
  const [taxpayerLookupGstin, setTaxpayerLookupGstin] = useState("");
  const [taxpayerLookupResult, setTaxpayerLookupResult] = useState<GSTINTaxpayerSearchResult | null>(null);
  const clientsQuery = useClientsQuery(workspaceId);
  const existingClientCodes = (clientsQuery.data?.items ?? []).map((client) => client.client_code);

  const createMutation = useCreateClientMutation(workspaceId);
  const bootstrapMutation = useBootstrapClientMutation(workspaceId);
  const updateMutation = useUpdateClientMutation(initialValues?.workspace, initialValues?.id);
  const searchTaxpayerMutation = useSearchTaxpayerMutation(workspaceId);
  const isEditing = Boolean(initialValues);
  const isSubmitting = createMutation.isPending || bootstrapMutation.isPending || updateMutation.isPending;

  const handleSearchTaxpayer = async () => {
    if (!workspaceId) {
      toast.error("Select a workspace before fetching taxpayer details.");
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
      form.setValue("legal_name", result.legal_name || form.getValues("legal_name"), { shouldDirty: true });
      form.setValue("trade_name", result.trade_name || result.legal_name || "", { shouldDirty: true });
      form.setValue("pan", result.pan || form.getValues("pan"), { shouldDirty: true });
      form.setValue("gstin", result.gstin, { shouldDirty: true });
      form.setValue("state_code", result.state_code || result.gstin.slice(0, 2), { shouldDirty: true });
      form.setValue("registration_type", normalizeRegistrationType(result.registration_type), { shouldDirty: true });
      if (!form.getValues("client_code").trim()) {
        const suggestedCode = buildUniqueClientCode(
          buildSuggestedClientCode(result.legal_name || result.trade_name || result.gstin, result.pan),
          existingClientCodes,
          initialValues?.client_code,
        );
        form.setValue(
          "client_code",
          suggestedCode,
          { shouldDirty: true },
        );
      }
      if (!form.getValues("email").trim()) {
        form.setValue(
          "email",
          buildSuggestedClientEmail(result.legal_name || result.trade_name || result.gstin),
          { shouldDirty: true },
        );
      }
      setTaxpayerLookupResult(result);
      toast.success("Taxpayer details fetched. Review and create the client.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const clientPayload = {
      workspace: values.workspace,
      legal_name: values.legal_name,
      trade_name: values.trade_name ?? "",
      client_code: values.client_code,
      pan: values.pan,
      email: values.email ?? "",
    };
    try {
      if (isEditing) {
        await updateMutation.mutateAsync(clientPayload);
        toast.success("Client updated successfully.");
      } else if (values.gstin?.trim()) {
        const result = await bootstrapMutation.mutateAsync({
          workspace: values.workspace,
          legal_name: values.legal_name,
          trade_name: values.trade_name ?? "",
          client_code: values.client_code,
          pan: values.pan,
          email: values.email ?? "",
          gstin: values.gstin.trim().toUpperCase(),
          registration_type: normalizeRegistrationType(values.registration_type),
          state_code: values.state_code?.trim() || values.gstin.trim().slice(0, 2),
          whitebooks_gst_username: values.whitebooks_gst_username?.trim() || "",
          taxpayer_lookup_payload:
            taxpayerLookupResult?.gstin === values.gstin.trim().toUpperCase()
              ? taxpayerLookupResult.raw_payload
              : undefined,
        });
        setSelectedClientId(result.client.id);
        if (result.gstin?.id) {
          setSelectedGstinId(result.gstin.id);
        }
        toast.success("Client and GSTIN created successfully.");
      } else {
        const result = await createMutation.mutateAsync(clientPayload);
        setSelectedClientId(result.id);
        setSelectedGstinId("");
        toast.success("Client created successfully.");
      }
      onOpenChange(false);
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      if (fieldErrors) {
        if (!isEditing && fieldErrors.client_code?.[0]?.includes("already exists")) {
          const nextCode = buildUniqueClientCode(
            form.getValues("client_code") || buildSuggestedClientCode(form.getValues("legal_name"), form.getValues("pan")),
            existingClientCodes,
            initialValues?.client_code,
          );
          if (nextCode && nextCode !== form.getValues("client_code")) {
            form.setValue("client_code", nextCode, { shouldDirty: true, shouldValidate: true });
            toast.error(`Client code already exists. Suggested available code: ${nextCode}`);
          }
        }
        for (const [fieldName, messages] of Object.entries(fieldErrors)) {
          if (fieldName in values) {
            form.setError(fieldName as keyof ClientFormValues, {
              type: "server",
              message: messages[0],
            });
          }
        }
      }
      toast.error(getErrorMessage(error));
    }
  });

  return (
      <AppModalContent size="md">
        <AppModalHeader
          title={isEditing ? "Edit client" : "Create client"}
          description="Create and manage clients in the live workspace foundation."
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <AppModalBody className="space-y-4">
          {!isEditing ? (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
              <p className="text-sm font-medium text-slate-900">GSTIN lookup assist</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Search taxpayer details from the connected filing channel and prefill the client record before creating it.
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
                  disabled={searchTaxpayerMutation.isPending || !workspaceId}
                >
                  {searchTaxpayerMutation.isPending ? "Searching..." : "Fetch taxpayer"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Workspace</Label>
            <Select value={workspaceId} onValueChange={(value) => form.setValue("workspace", value)}>
              <SelectTrigger className="h-10 w-full">
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
            {form.formState.errors.workspace ? (
              <p className="text-xs text-rose-600">{form.formState.errors.workspace.message}</p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legal_name">Legal name</Label>
              <Input id="legal_name" {...form.register("legal_name")} />
              {form.formState.errors.legal_name ? (
                <p className="text-xs text-rose-600">{form.formState.errors.legal_name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade_name">Trade name</Label>
              <Input id="trade_name" {...form.register("trade_name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_code">Client code</Label>
              <Input id="client_code" {...form.register("client_code")} />
              {form.formState.errors.client_code ? (
                <p className="text-xs text-rose-600">{form.formState.errors.client_code.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pan">PAN</Label>
              <Input id="pan" {...form.register("pan")} />
              {form.formState.errors.pan ? (
                <p className="text-xs text-rose-600">{form.formState.errors.pan.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          {!isEditing ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-slate-900">Create GSTIN now</p>
                <p className="text-sm leading-6 text-slate-600">
                  Save the GST registration in the same step so onboarding does not need a second screen.
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" {...form.register("gstin")} maxLength={15} />
                  {form.formState.errors.gstin ? (
                    <p className="text-xs text-rose-600">{form.formState.errors.gstin.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whitebooks_gst_username">Customer GST portal username (Recommended)</Label>
                  <Input
                    id="whitebooks_gst_username"
                    {...form.register("whitebooks_gst_username")}
                    placeholder="Enter the customer's GST portal username"
                  />
                  <p className="text-xs text-slate-500">
                    Recommended for smoother filing access and later filing steps.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state_code">State code</Label>
                  <Input id="state_code" {...form.register("state_code")} maxLength={2} />
                  {form.formState.errors.state_code ? (
                    <p className="text-xs text-rose-600">{form.formState.errors.state_code.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Registration type</Label>
                  <Select
                    value={form.watch("registration_type") || "regular"}
                    onValueChange={(value) => form.setValue("registration_type", value, { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Registration type" />
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
              </div>
            </div>
          ) : null}
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">
              {isEditing
                ? "Client records power GSTINs, periods, and filing context."
                : "If a GSTIN is provided, this step creates the client, GSTIN, and taxpayer snapshot together."}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEditing ? "Save changes" : form.getValues("gstin")?.trim() ? "Create client and GSTIN" : "Create client"}
            </Button>
            </div>
          </AppModalFooter>
        </form>
      </AppModalContent>
  );
}
