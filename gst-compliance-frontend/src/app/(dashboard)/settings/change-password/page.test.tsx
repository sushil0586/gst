vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth/auth-service", () => ({
  authService: {
    changePassword: vi.fn(),
  },
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChangePasswordPage from "@/app/(dashboard)/settings/change-password/page";
import { authService } from "@/lib/auth/auth-service";
import { toast } from "sonner";

const mockedChangePassword = vi.mocked(authService.changePassword);

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a password change and shows success", async () => {
    mockedChangePassword.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current password"), "old-pass-123");
    await user.type(screen.getByLabelText("New password"), "new-pass-123");
    await user.type(screen.getByLabelText("Confirm new password"), "new-pass-123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(mockedChangePassword).toHaveBeenCalledWith({
      current_password: "old-pass-123",
      new_password: "new-pass-123",
    });
    expect(toast.success).toHaveBeenCalledWith("Password changed successfully.");
  });
});
