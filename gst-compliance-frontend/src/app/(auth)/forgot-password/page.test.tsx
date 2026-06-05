vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth/auth-service", () => ({
  authService: {
    forgotPassword: vi.fn(),
  },
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import { authService } from "@/lib/auth/auth-service";
import { toast } from "sonner";

const mockedForgotPassword = vi.mocked(authService.forgotPassword);

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits forgot-password requests and shows success", async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mockedForgotPassword).toHaveBeenCalledWith({ email: "owner@example.com" });
    expect(toast.success).toHaveBeenCalledWith("If your account exists, a password reset link has been sent.");
  });
});
