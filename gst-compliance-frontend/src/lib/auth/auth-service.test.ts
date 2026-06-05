import axios from "axios";

import { authService } from "@/lib/auth/auth-service";

vi.mock("axios");

const mockedAxios = vi.mocked(axios, true);

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in using the auth proxy", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        user: {
          user: { id: 1, email: "owner@example.com" },
        },
      },
    });

    const result = await authService.login("owner@example.com", "strong-pass-123");

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "owner@example.com",
      password: "strong-pass-123",
    });
    expect(result.user.email).toBe("owner@example.com");
  });

  it("requests forgot-password through the auth proxy", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await authService.forgotPassword({ email: "owner@example.com" });

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/auth/forgot-password", {
      email: "owner@example.com",
    });
  });

  it("submits reset-password through the auth proxy", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await authService.resetPassword({
      uid: "abc123",
      token: "secure-token",
      password: "brand-new-pass-123",
    });

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/auth/reset-password", {
      uid: "abc123",
      token: "secure-token",
      password: "brand-new-pass-123",
    });
  });

  it("submits change-password through the auth proxy", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await authService.changePassword({
      current_password: "old-pass-123",
      new_password: "new-pass-123",
    });

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/auth/change-password", {
      current_password: "old-pass-123",
      new_password: "new-pass-123",
    });
  });

  it("returns false from hasSession when no current user exists", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        status: "success",
        message: "Success",
        data: null,
      },
    });

    const result = await authService.hasSession();

    expect(result).toBe(false);
  });
});
