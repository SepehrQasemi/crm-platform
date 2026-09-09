import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFluentQuery } from "./helpers";

const mocks = vi.hoisted(() => ({
  env: { brevoWebhookSecret: "" },
  from: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { POST } from "@/app/api/webhooks/brevo/route";

function webhookRequest(token?: string, queryToken?: string) {
  const url = new URL("http://127.0.0.1:3000/api/webhooks/brevo");
  if (queryToken) url.searchParams.set("token", queryToken);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-webhook-token": token } : {}),
    },
    body: JSON.stringify({ event: "delivered", "message-id": "message-1" }),
  });
}

describe("POST /api/webhooks/brevo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.brevoWebhookSecret = "";
    mocks.from.mockReturnValue(createFluentQuery({ data: [], error: null }));
  });

  it("rejects requests when no webhook secret is configured", async () => {
    const response = await POST(webhookRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized webhook call" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid webhook secret", async () => {
    mocks.env.brevoWebhookSecret = "expected-secret";

    const response = await POST(webhookRequest("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("accepts a valid webhook header secret", async () => {
    mocks.env.brevoWebhookSecret = "expected-secret";

    const response = await POST(webhookRequest("expected-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed: 1, updated: 0, skipped: 1 });
    expect(mocks.from).toHaveBeenCalledWith("email_logs");
  });

  it("preserves valid query-token authentication", async () => {
    mocks.env.brevoWebhookSecret = "expected-secret";

    const response = await POST(webhookRequest(undefined, "expected-secret"));

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("email_logs");
  });
});