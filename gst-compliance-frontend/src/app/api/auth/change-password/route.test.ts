vi.mock("@/lib/server/session", () => ({
  fetchWithSession: vi.fn(),
}));

import { POST } from "@/app/api/auth/change-password/route";
import { fetchWithSession } from "@/lib/server/session";

const mockedFetchWithSession = vi.mocked(fetchWithSession);

describe("change-password auth route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies successful change-password requests", async () => {
    mockedFetchWithSession.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Password changed successfully." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: "old-pass", new_password: "new-pass-123" }),
      }),
    );

    expect(mockedFetchWithSession).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Password changed successfully." });
  });

  it("returns backend errors when change-password fails", async () => {
    mockedFetchWithSession.mockResolvedValueOnce(
      new Response(JSON.stringify({ current_password: ["Current password is incorrect."] }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: "wrong-pass", new_password: "new-pass-123" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ current_password: ["Current password is incorrect."] });
  });
});
