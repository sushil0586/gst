vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/query/session-provider", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/store/workspace-context", () => ({
  useWorkspaceContext: vi.fn(),
}));

vi.mock("@/features/workspace", () => ({
  useWorkspaceMembersQuery: vi.fn(),
  useCreateWorkspaceMemberMutation: vi.fn(),
  useUpdateWorkspaceMemberMutation: vi.fn(),
  useDeactivateWorkspaceMemberMutation: vi.fn(),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TeamManagementPage from "@/app/(dashboard)/settings/team/page";
import {
  useCreateWorkspaceMemberMutation,
  useDeactivateWorkspaceMemberMutation,
  useUpdateWorkspaceMemberMutation,
  useWorkspaceMembersQuery,
} from "@/features/workspace";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import { toast } from "sonner";

const mockedUseSession = vi.mocked(useSession);
const mockedUseWorkspaceContext = vi.mocked(useWorkspaceContext);
const mockedUseWorkspaceMembersQuery = vi.mocked(useWorkspaceMembersQuery);
const mockedUseCreateWorkspaceMemberMutation = vi.mocked(useCreateWorkspaceMemberMutation);
const mockedUseUpdateWorkspaceMemberMutation = vi.mocked(useUpdateWorkspaceMemberMutation);
const mockedUseDeactivateWorkspaceMemberMutation = vi.mocked(useDeactivateWorkspaceMemberMutation);

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deactivateMutateAsync = vi.fn();

const baseMember = {
  id: "membership-1",
  workspace_id: "workspace-1",
  workspace_name: "Primary Workspace",
  user_id: 21,
  username: "filer.user",
  email: "filer@example.com",
  first_name: "Filer",
  last_name: "User",
  full_name: "Filer User",
  role: "filer",
  permissions: ["prepare_return"],
  is_active: true,
  created_at: "2026-06-05T10:00:00Z",
  updated_at: "2026-06-05T10:00:00Z",
};

function setupTeamPage(memberOverrides?: Partial<typeof baseMember>) {
  mockedUseSession.mockReturnValue({
    session: { is_platform_admin: false },
    permissions: ["manage_users"],
  } as never);
  mockedUseWorkspaceContext.mockReturnValue({
    selectedWorkspaceId: "workspace-1",
    selectedWorkspace: { name: "Primary Workspace" },
  } as never);
  mockedUseWorkspaceMembersQuery.mockReturnValue({
    data: { items: [{ ...baseMember, ...memberOverrides }] },
    isLoading: false,
    isError: false,
  } as never);
  mockedUseCreateWorkspaceMemberMutation.mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  } as never);
  mockedUseUpdateWorkspaceMemberMutation.mockReturnValue({
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as never);
  mockedUseDeactivateWorkspaceMemberMutation.mockReturnValue({
    mutateAsync: deactivateMutateAsync,
    isPending: false,
  } as never);

  return render(<TeamManagementPage />);
}

describe("TeamManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new workspace member from the UI", async () => {
    createMutateAsync.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    setupTeamPage();

    await user.click(screen.getByRole("button", { name: "Add Member" }));
    await user.type(screen.getByLabelText("Email"), "newfiler@example.com");
    await user.type(screen.getByLabelText("First name"), "New");
    await user.type(screen.getByLabelText("Last name"), "Filer");
    await user.type(screen.getByLabelText("Initial password"), "strong-pass-123");
    await user.click(screen.getByRole("button", { name: "Add member" }));

    expect(createMutateAsync).toHaveBeenCalledWith({
      workspace: "workspace-1",
      email: "newfiler@example.com",
      first_name: "New",
      last_name: "Filer",
      role: "filer",
      password: "strong-pass-123",
    });
    expect(toast.success).toHaveBeenCalledWith("Workspace member added.");
  });

  it("updates an existing member role and password from the UI", async () => {
    updateMutateAsync.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    setupTeamPage({ role: "reviewer", first_name: "Review", last_name: "Owner", full_name: "Review Owner" });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const firstNameInput = screen.getByLabelText("First name");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Updated");
    await user.type(screen.getByLabelText("Reset password (optional)"), "changed-pass-123");
    await user.click(screen.getByRole("button", { name: "Save role" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      role: "reviewer",
      first_name: "Updated",
      last_name: "Owner",
      password: "changed-pass-123",
    });
    expect(toast.success).toHaveBeenCalledWith("Workspace member updated.");
  });
});
