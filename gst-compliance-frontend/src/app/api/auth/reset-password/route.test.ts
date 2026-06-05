import { POST } from "@/app/api/auth/reset-password/route";

describe("reset-password auth route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("proxies successful reset-password requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Password reset successful." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ uid: "abc", token: "def", password: "brand-new-pass-123" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Password reset successful." });
  });

  it("returns backend validation failures from reset-password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: ["expired"] }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ uid: "abc", token: "def", password: "brand-new-pass-123" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ token: ["expired"] });
  });
});
