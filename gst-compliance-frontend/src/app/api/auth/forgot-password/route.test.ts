import { POST } from "@/app/api/auth/forgot-password/route";

describe("forgot-password auth route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("proxies successful forgot-password requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "reset email queued" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "reset email queued" });
  });

  it("returns backend errors when forgot-password fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "invalid request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.com" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "invalid request" });
  });
});
