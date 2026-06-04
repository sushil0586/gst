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
import { useCreateCompliancePeriodMutation, useUpdateCompliancePeriodMutation } from "@/features/compliance-periods";
import { getErrorMessage } from "@/lib/api/error-handler";
import { compliancePeriodFormSchema, type CompliancePeriodFormValues } from "@/lib/validations/foundation";
import type { CompliancePeriodRecord, GSTINRecordApi } from "@/types/api";

export function CompliancePeriodFormDialog({
  open,
  onOpenChange,
  gstins,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gstins: GSTINRecordApi[];
  initialValues?: CompliancePeriodRecord | null;
}) {
  const form = useForm<CompliancePeriodFormValues>({
    resolver: zodResolver(compliancePeriodFormSchema),
    defaultValues: {
      gstin: initialValues?.gstin ?? gstins[0]?.id ?? "",
      period: initialValues?.period ?? "",
      return_type: initialValues?.return_type ?? "GSTR-3B",
      status: initialValues?.status ?? "open",
      due_date: initialValues?.due_date ?? "",
    },
  });
  const gstinId = useWatch({ control: form.control, name: "gstin" });
  const returnType = useWatch({ control: form.control, name: "return_type" });
  const status = useWatch({ control: form.control, name: "status" });

  useEffect(() => {
    form.reset({
      gstin: initialValues?.gstin ?? gstins[0]?.id ?? "",
      period: initialValues?.period ?? "",
      return_type: initialValues?.return_type ?? "GSTR-3B",
      status: initialValues?.status ?? "open",
      due_date: initialValues?.due_date ?? "",
    });
  }, [form, gstins, initialValues]);

  const createMutation = useCreateCompliancePeriodMutation(gstinId);
  const updateMutation = useUpdateCompliancePeriodMutation(initialValues?.gstin, initialValues?.id);
  const isEditing = Boolean(initialValues);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = { ...values, due_date: values.due_date || null };
      if (isEditing) {
        await updateMutation.mutateAsync(payload);
        toast.success("Compliance period updated successfully.");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Compliance period created successfully.");
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
          title={isEditing ? "Edit compliance period" : "Create compliance period"}
          description="Manage filing cycles through the connected foundation APIs."
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <AppModalBody className="space-y-4">
            <div className="space-y-2">
              <Label>GSTIN</Label>
              <Select value={gstinId} onValueChange={(value) => form.setValue("gstin", value)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select GSTIN" />
                </SelectTrigger>
                <SelectContent>
                  {gstins.map((gstin) => (
                    <SelectItem key={gstin.id} value={gstin.id}>
                      {gstin.gstin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Input id="period" placeholder="YYYY-MM" {...form.register("period")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due date</Label>
                <Input id="due_date" type="date" {...form.register("due_date")} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Return type</Label>
                <Select value={returnType} onValueChange={(value) => form.setValue("return_type", value)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Return type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GSTR-1">GSTR-1</SelectItem>
                    <SelectItem value="GSTR-3B">GSTR-3B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => form.setValue("status", value)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Periods drive reconciliation, returns, approvals, and close tracking.</div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button type="submit">{isEditing ? "Save changes" : "Create period"}</Button>
            </div>
          </AppModalFooter>
        </form>
      </AppModalContent>
    </Dialog>
  );
}
