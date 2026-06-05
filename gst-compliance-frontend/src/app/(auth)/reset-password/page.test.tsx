vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const pushMock = vi.fn();
const getMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: getMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth/auth-service", () => ({
  authService: {
    resetPassword: vi.fn(),
  },
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import { authService } from "@/lib/auth/auth-service";
import { toast } from "sonner";

const mockedResetPassword = vi.mocked(authService.resetPassword);

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an error when uid or token is missing", async () => {
    getMock.mockReturnValue(null);
    const user = userEvent.setup();

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "brand-new-pass-123");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-pass-123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(mockedResetPassword).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Password reset link is incomplete or invalid.");
  });

  it("resets the password and redirects to login when params are present", async () => {
    getMock.mockImplementation((key: string) => (key === "uid" ? "abc123" : "secure-token"));
    mockedResetPassword.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "brand-new-pass-123");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-pass-123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(mockedResetPassword).toHaveBeenCalledWith({
      uid: "abc123",
      token: "secure-token",
      password: "brand-new-pass-123",
    });
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(toast.success).toHaveBeenCalledWith("Password reset successful. Please sign in with your new password.");
  });
});
