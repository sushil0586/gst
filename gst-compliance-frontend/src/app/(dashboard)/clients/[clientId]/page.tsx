"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Building2, CalendarClock, FileCheck2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { ClientFormDialog } from "@/components/forms/client-form-dialog";
import { CompliancePeriodFormDialog } from "@/components/forms/compliance-period-form-dialog";
import { GstinFormDialog } from "@/components/forms/gstin-form-dialog";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useClientContactsQuery,
  useClientQuery,
  useCreateClientContactMutation,
  useDeleteClientContactMutation,
  useUpdateClientContactMutation,
} from "@/features/clients";
import { useCompliancePeriodsQuery } from "@/features/compliance-periods";
import { useGstinsQuery } from "@/features/gstins";
import { getErrorMessage } from "@/lib/api/error-handler";
import { formatRegistrationTypeLabel } from "@/lib/constants/gst-registration-types";
import { useWorkspacesQuery } from "@/features/workspace";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import type { ClientContactRecord } from "@/types/api";

type ContactFormState = {
  name: string;
  designation: string;
  mobile_number: string;
  alternate_mobile_number: string;
  email: string;
  is_primary: boolean;
  preferred_contact_mode: ClientContactRecord["preferred_contact_mode"];
  notes: string;
};

const initialContactFormState: ContactFormState = {
  name: "",
  designation: "",
  mobile_number: "",
  alternate_mobile_number: "",
  email: "",
  is_primary: false,
  preferred_contact_mode: "call",
  notes: "",
};

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [gstinDialogOpen, setGstinDialogOpen] = useState(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContactRecord | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>(initialContactFormState);
  const { clientId } = use(params);
  const { user, permissions: sessionPermissions } = useSession();
  const workspacesQuery = useWorkspacesQuery();
  const clientQuery = useClientQuery(clientId);
  const client = clientQuery.data;
  const contactsQuery = useClientContactsQuery(clientId);
  const contacts = contactsQuery.data?.items ?? [];
  const createContactMutation = useCreateClientContactMutation(clientId);
  const updateContactMutation = useUpdateClientContactMutation(clientId, editingContact?.id);
  const deleteContactMutation = useDeleteClientContactMutation(clientId);
  const gstinsQuery = useGstinsQuery(clientId);
  const liveGstins = gstinsQuery.data?.items ?? [];
  const displayGstins = liveGstins.map((gstin) => ({
        id: gstin.id,
        gstin: gstin.gstin,
        state: gstin.state_code,
        registrationType: formatRegistrationTypeLabel(gstin.registration_type),
        status: gstin.is_active ? "Active" : "Inactive",
      }));
  const primaryGstinId = liveGstins[0]?.id;
  const periodsQuery = useCompliancePeriodsQuery(primaryGstinId);
  const displayPeriods = (periodsQuery.data?.items ?? []).map((period) => ({
        id: period.id,
        label: period.period,
        filingFrequency: period.return_type,
        dueDate: period.due_date ?? "Not set",
        status: period.status,
      }));
  const overviewCards = useMemo(() => {
    const dueSoonCount = displayPeriods.filter((period) => {
      if (!period.dueDate || period.dueDate === "Not set") {
        return false;
      }
      const dueDate = new Date(period.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return false;
      }
      const now = new Date();
      const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= -1 && diffDays <= 7;
    }).length;
    const filedCount = displayPeriods.filter((period) => period.status.toLowerCase().includes("filed")).length;
    const activeGstinCount = displayGstins.filter((gstin) => gstin.status.toLowerCase() === "active").length;
    const exceptionCount = displayPeriods.filter((period) => {
      const normalized = period.status.toLowerCase();
      return normalized.includes("review") || normalized.includes("hold") || normalized.includes("error");
    }).length;
    return [
      {
        title: "Registered GSTINs",
        value: `${displayGstins.length}`,
        detail: activeGstinCount === displayGstins.length
          ? "All visible registrations are active."
          : `${activeGstinCount} active registration${activeGstinCount === 1 ? "" : "s"} in this client.`,
        icon: Building2,
      },
      {
        title: "Periods in scope",
        value: `${displayPeriods.length}`,
        detail: dueSoonCount > 0
          ? `${dueSoonCount} due soon across the visible filing calendar.`
          : "No immediate filing deadlines in the next 7 days.",
        icon: CalendarClock,
      },
      {
        title: "Filed periods",
        value: `${filedCount}`,
        detail: filedCount > 0
          ? `${filedCount} period${filedCount === 1 ? "" : "s"} already completed.`
          : "No periods have been marked filed yet.",
        icon: FileCheck2,
      },
      {
        title: "Needs attention",
        value: `${exceptionCount}`,
        detail: exceptionCount > 0
          ? "Review periods that are not yet fully on track."
          : "No visible period exceptions for this client.",
        icon: ShieldAlert,
      },
    ];
  }, [displayGstins, displayPeriods]);
  const canManageClient = hasPermission(sessionPermissions, permissions.manageClient);
  const canManageGstin = hasPermission(sessionPermissions, permissions.manageGstin);
  const canPrepareReturn = hasPermission(sessionPermissions, permissions.prepareReturn);

  const resetContactDialog = () => {
    setContactDialogOpen(false);
    setEditingContact(null);
    setContactForm(initialContactFormState);
  };

  const openCreateContactDialog = () => {
    setEditingContact(null);
    setContactForm(initialContactFormState);
    setContactDialogOpen(true);
  };

  const openEditContactDialog = (contact: ClientContactRecord) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      designation: contact.designation,
      mobile_number: contact.mobile_number,
      alternate_mobile_number: contact.alternate_mobile_number,
      email: contact.email,
      is_primary: contact.is_primary,
      preferred_contact_mode: contact.preferred_contact_mode,
      notes: contact.notes,
    });
    setContactDialogOpen(true);
  };

  const handleContactSubmit = async () => {
    if (!client) {
      return;
    }
    try {
      if (editingContact) {
        await updateContactMutation.mutateAsync(contactForm);
        toast.success("Client contact updated.");
      } else {
        await createContactMutation.mutateAsync({
          client: client.id,
          ...contactForm,
        });
        toast.success("Client contact added.");
      }
      resetContactDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await deleteContactMutation.mutateAsync(contactId);
      toast.success("Client contact removed.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={client?.legal_name ?? "Client workspace"}
        description={`Client code ${client?.client_code ?? "N/A"} • Filing owner ${user?.full_name ?? "Assigned user"}`}
        actions={[
          ...(canManageClient ? [{ label: "Edit Client", onClick: () => setClientDialogOpen(true) }] : []),
          ...(canManageClient ? [{ label: "Add Contact", onClick: openCreateContactDialog }] : []),
          ...(canManageGstin ? [{ label: "Add GSTIN", onClick: () => setGstinDialogOpen(true) }] : []),
          ...(canPrepareReturn ? [{ label: "Add Period", onClick: () => setPeriodDialogOpen(true) }] : []),
        ]}
      />
      {clientQuery.isLoading ? <LoadingState message="Loading client workspace..." /> : null}
      {clientQuery.isError ? (
        <ErrorState description="We couldn't load this client workspace. Resolve the API issue before continuing with client operations." />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <SectionCard key={card.title} title={card.title}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                <card.icon className="size-5" />
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Customer contacts" description="Customer call, WhatsApp, and email contacts for filing coordination.">
          {contactsQuery.isLoading ? <LoadingState message="Loading client contacts..." /> : null}
          {contactsQuery.isError ? <ErrorState description="Live customer contact data could not be loaded right now." /> : null}
          {contacts.length === 0 && !contactsQuery.isLoading ? (
            <EmptyState
              title="No contacts added yet"
              description="Add at least one primary customer contact so return and filing follow-ups can be managed properly."
              action={canManageClient ? (
                <Button onClick={openCreateContactDialog}>
                  <ActionLabel kind="create" label="Add first contact" />
                </Button>
              ) : undefined}
            />
          ) : null}
          {contacts.length > 0 ? (
            <DataTableShell
              columns={[
                { key: "name", label: "Contact" },
                { key: "mobile", label: "Mobile" },
                { key: "email", label: "Email" },
                { key: "mode", label: "Preferred Mode" },
                { key: "primary", label: "Primary" },
                { key: "actions", label: "" },
              ]}
              rows={contacts.map((contact) => ({
                id: contact.id,
                name: (
                  <div>
                    <p className="font-medium text-slate-900">{contact.name}</p>
                    <p className="text-xs text-slate-500">{contact.designation || "No designation set"}</p>
                  </div>
                ),
                mobile: (
                  <div>
                    <p>{contact.mobile_number || "Not set"}</p>
                    <p className="text-xs text-slate-500">{contact.alternate_mobile_number || "No alternate mobile"}</p>
                  </div>
                ),
                email: contact.email || "Not set",
                mode: contact.preferred_contact_mode.replace(/_/g, " "),
                primary: contact.is_primary ? "Yes" : "No",
                actions: canManageClient ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditContactDialog(contact)}>
                      <ActionLabel kind="edit" label="Edit" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteContact(contact.id)}>
                      <ActionLabel kind="deactivate" label="Remove" />
                    </Button>
                  </div>
                ) : null,
              }))}
            />
          ) : null}
        </SectionCard>
        <SectionCard title="Registered GSTINs" description="State registrations and active compliance scope.">
          {gstinsQuery.isLoading ? <LoadingState message="Loading GSTINs..." /> : null}
          {gstinsQuery.isError ? <ErrorState description="Live GSTIN data could not be loaded. Resolve the API issue before continuing with registration work." /> : null}
          {displayGstins.length === 0 ? <EmptyState title="No GSTINs found" description="Add a GSTIN to begin period-level compliance operations." /> : (
          <DataTableShell
            columns={[
              { key: "gstin", label: "GSTIN" },
              { key: "state", label: "State" },
              { key: "registrationType", label: "Registration Type" },
              { key: "status", label: "Status" },
            ]}
            rows={displayGstins}
          />)}
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/clients/${clientId}/gstins`}>
                <ActionLabel kind="view" label="View GSTIN workspace" />
              </Link>
            </Button>
          </div>
        </SectionCard>
        <SectionCard title="Compliance periods" description="Current filing periods available for this client.">
          {periodsQuery.isLoading ? <LoadingState message="Loading compliance periods..." /> : null}
          {periodsQuery.isError ? <ErrorState description="Live period data is unavailable. Resolve the API issue before continuing with period work." /> : null}
          {displayPeriods.length === 0 ? <EmptyState title="No periods found" description="Create a compliance period after adding a GSTIN." /> : (
          <DataTableShell
            columns={[
              { key: "label", label: "Period" },
              { key: "filingFrequency", label: "Frequency" },
              { key: "dueDate", label: "Due Date" },
              { key: "status", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={displayPeriods.map((period) => ({
              id: period.id,
              label: period.label,
              filingFrequency: period.filingFrequency,
              dueDate: period.dueDate,
              status: period.status,
              actions: (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/clients/${clientId}/periods/${period.id}`}>
                    <ActionLabel kind="open" label="Open period" />
                  </Link>
                </Button>
              ),
            }))}
          />)}
        </SectionCard>
      </div>
      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        workspaces={workspacesQuery.data?.items ?? []}
        initialValues={client ?? null}
      />
      <GstinFormDialog
        open={gstinDialogOpen}
        onOpenChange={setGstinDialogOpen}
        clients={client ? [client] : []}
      />
        <CompliancePeriodFormDialog
          open={periodDialogOpen}
          onOpenChange={setPeriodDialogOpen}
          gstins={liveGstins}
        />
      <Dialog open={contactDialogOpen} onOpenChange={(open) => (!open ? resetContactDialog() : setContactDialogOpen(open))}>
        <AppModalContent size="md">
          <AppModalHeader
            title={editingContact ? "Update customer contact" : "Add customer contact"}
            description="Maintain the actual customer contact person, phone, and preferred coordination mode for filing work."
          />
          <AppModalBody className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact-name">Contact name</Label>
              <Input
                id="contact-name"
                value={contactForm.name}
                onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-designation">Designation</Label>
              <Input
                id="contact-designation"
                value={contactForm.designation}
                onChange={(event) => setContactForm((current) => ({ ...current, designation: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred contact mode</Label>
              <Select
                value={contactForm.preferred_contact_mode}
                onValueChange={(value) =>
                  setContactForm((current) => ({
                    ...current,
                    preferred_contact_mode: value as ClientContactRecord["preferred_contact_mode"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-mobile">Mobile number</Label>
              <Input
                id="contact-mobile"
                value={contactForm.mobile_number}
                onChange={(event) => setContactForm((current) => ({ ...current, mobile_number: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-alternate-mobile">Alternate mobile</Label>
              <Input
                id="contact-alternate-mobile"
                value={contactForm.alternate_mobile_number}
                onChange={(event) => setContactForm((current) => ({ ...current, alternate_mobile_number: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                value={contactForm.email}
                onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={contactForm.notes}
                onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Monthly filing owner, OTP coordinator, escalation contact, or calling notes..."
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                id="contact-primary"
                type="checkbox"
                checked={contactForm.is_primary}
                onChange={(event) => setContactForm((current) => ({ ...current, is_primary: event.target.checked }))}
              />
              <Label htmlFor="contact-primary">Mark as primary customer contact</Label>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">
              At least one mobile number, alternate mobile number, or email is required so follow-up work has a usable contact channel.
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={resetContactDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleContactSubmit}
                disabled={
                  createContactMutation.isPending ||
                  updateContactMutation.isPending ||
                  !contactForm.name ||
                  (!contactForm.mobile_number && !contactForm.alternate_mobile_number && !contactForm.email)
                }
              >
                {editingContact
                  ? updateContactMutation.isPending
                    ? "Saving..."
                    : "Save contact"
                  : createContactMutation.isPending
                    ? "Adding..."
                    : "Add contact"}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
