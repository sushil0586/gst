"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { ActionLabel } from "@/components/common/action-label";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateGstinMutation, useUpdateGstinMutation } from "@/features/gstins";
import { GST_REGISTRATION_TYPE_OPTIONS, normalizeRegistrationType } from "@/lib/constants/gst-registration-types";
import { getErrorMessage } from "@/lib/api/error-handler";
import { gstinFormSchema, type GstinFormValues } from "@/lib/validations/foundation";
import type { ClientRecord, GSTINRecordApi } from "@/types/api";

export function GstinFormDialog({
  open,
  onOpenChange,
  clients,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientRecord[];
  initialValues?: GSTINRecordApi | null;
}) {
  const form = useForm<GstinFormValues>({
    resolver: zodResolver(gstinFormSchema),
    defaultValues: {
      client: initialValues?.client ?? clients[0]?.id ?? "",
      gstin: initialValues?.gstin ?? "",
      registration_type: normalizeRegistrationType(initialValues?.registration_type),
      state_code: initialValues?.state_code ?? "",
      whitebooks_gst_username: initialValues?.whitebooks_gst_username ?? "",
    },
  });
  const clientId = useWatch({ control: form.control, name: "client" });
  const registrationType = useWatch({ control: form.control, name: "registration_type" });

  useEffect(() => {
    form.reset({
      client: initialValues?.client ?? clients[0]?.id ?? "",
      gstin: initialValues?.gstin ?? "",
      registration_type: normalizeRegistrationType(initialValues?.registration_type),
      state_code: initialValues?.state_code ?? "",
      whitebooks_gst_username: initialValues?.whitebooks_gst_username ?? "",
    });
  }, [clients, form, initialValues]);

  const createMutation = useCreateGstinMutation(clientId);
  const updateMutation = useUpdateGstinMutation(initialValues?.client, initialValues?.id);
  const isEditing = Boolean(initialValues);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      registration_type: normalizeRegistrationType(values.registration_type),
      state_code: values.state_code ?? "",
      whitebooks_gst_username: values.whitebooks_gst_username ?? "",
    };
    try {
      if (isEditing) {
        await updateMutation.mutateAsync(payload);
        toast.success("GSTIN updated successfully.");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("GSTIN created successfully.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader
          title={isEditing ? "Edit GSTIN" : "Create GSTIN"}
          description="Use the live foundation for GSTIN setup."
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <AppModalBody className="space-y-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={(value) => form.setValue("client", value)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input id="gstin" {...form.register("gstin")} />
              {form.formState.errors.gstin ? (
                <p className="text-xs text-rose-600">{form.formState.errors.gstin.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="state_code">State code</Label>
              <Input id="state_code" {...form.register("state_code")} />
              {form.formState.errors.state_code ? (
                <p className="text-xs text-rose-600">{form.formState.errors.state_code.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Registration type</Label>
            <Select
              value={registrationType}
              onValueChange={(value) => form.setValue("registration_type", value)}
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
          <div className="space-y-2">
            <Label htmlFor="whitebooks_gst_username">Customer GST portal username (Recommended)</Label>
            <Input
              id="whitebooks_gst_username"
              {...form.register("whitebooks_gst_username")}
              placeholder="Enter the customer's GST portal username"
            />
            <p className="text-xs text-slate-500">
              Recommended for smoother filing access. You can still create the GSTIN now and update this later if needed.
            </p>
          </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">GSTIN setup controls registration, state, return readiness, and optional filing identity context.</div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button type="submit">{isEditing ? "Save changes" : "Create GSTIN"}</Button>
            </div>
          </AppModalFooter>
        </form>
      </AppModalContent>
    </Dialog>
  );
}
