import { PlaceholderPage } from "@/components/common/placeholder-page";
import { notices } from "@/data/notices";

export default function NoticesPage() {
  return (
    <PlaceholderPage
      title="Notices"
      description="Track open government notices, response deadlines, and escalation readiness in a premium workspace view."
      statusTitle="Pilot shell: notices"
      statusDescription="The notices route is currently a preview experience with representative data. Live notice ingestion, document handling, assignments, and response workflows still need backend wiring."
      tableTitle="Notice register"
      tableDescription="Mock notices with response posture and due dates."
      columns={[
        { key: "reference", label: "Reference" },
        { key: "clientName", label: "Client" },
        { key: "status", label: "Status" },
        { key: "dueDate", label: "Due Date" },
      ]}
      rows={notices}
      emptyTitle="Notice workflow shell"
      emptyDescription="Document uploads, tasking, and response packs can be layered in without redesigning this page."
    />
  );
}
