import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

type EmailLogRow = {
  id: string;
  status: "pending" | "sent" | "failed";
  open_count: number;
  click_count: number;
  opened_at: string | null;
  clicked_at: string | null;
};

function normalizeMessageId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^<|>$/g, "");
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseWebhookEvents(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    const events = objectPayload.events;
    if (Array.isArray(events)) {
      return events.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === "object",
      );
    }
    return [objectPayload];
  }

  return [];
}

function isOpenEvent(eventName: string) {
  return eventName.includes("open");
}

function isClickEvent(eventName: string) {
  return eventName.includes("click");
}

function isFailureEvent(eventName: string) {
  const failures = ["bounce", "blocked", "spam", "invalid", "unsub", "rejected"];
  return failures.some((item) => eventName.includes(item));
}

function resolveEventTimestamp(event: Record<string, unknown>): string {
  const raw = readString(event, ["date", "ts_event", "time", "eventDate"]);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

async function findEmailLogByMessageId(messageId: string): Promise<EmailLogRow | null> {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return null;

  const candidates = Array.from(new Set([messageId.trim(), normalized, `<${normalized}>`]));

  const { data, error } = await supabaseAdmin
    .from("email_logs")
    .select("id,status,open_count,click_count,opened_at,clicked_at")
    .in("provider_message_id", candidates)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return null;
  return (data?.[0] as EmailLogRow | undefined) ?? null;
}

function isWebhookAuthorized(request: Request, url: URL) {
  if (!env.brevoWebhookSecret) return false;

  const queryToken = url.searchParams.get("token");
  const headerToken = request.headers.get("x-webhook-token");
  return queryToken === env.brevoWebhookSecret || headerToken === env.brevoWebhookSecret;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isWebhookAuthorized(request, requestUrl)) {
    return fail("Unauthorized webhook call", 401);
  }

  const payload = await request.json().catch(() => null);
  const events = parseWebhookEvents(payload);

  if (events.length === 0) {
    return fail("No Brevo events in payload", 400);
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    processed += 1;

    const eventNameRaw = readString(event, ["event", "type", "event_name"]);
    const eventName = (eventNameRaw ?? "").toLowerCase();
    const messageIdRaw = readString(event, ["message-id", "messageId", "message_id", "id"]);
    const messageId = normalizeMessageId(messageIdRaw);

    if (!messageId || !eventName) {
      skipped += 1;
      continue;
    }

    const log = await findEmailLogByMessageId(messageId);
    if (!log) {
      skipped += 1;
      continue;
    }

    const eventTimestamp = resolveEventTimestamp(event);
    const patch: {
      open_count?: number;
      click_count?: number;
      opened_at?: string;
      clicked_at?: string;
      status?: "pending" | "sent" | "failed";
      error_message?: string | null;
    } = {};

    if (isOpenEvent(eventName)) {
      patch.open_count = (log.open_count ?? 0) + 1;
      if (!log.opened_at) patch.opened_at = eventTimestamp;
    }

    if (isClickEvent(eventName)) {
      patch.click_count = (log.click_count ?? 0) + 1;
      patch.clicked_at = eventTimestamp;
      if (!log.opened_at) patch.opened_at = eventTimestamp;
    }

    if (isFailureEvent(eventName)) {
      patch.status = "failed";
      patch.error_message = `Brevo event: ${eventName}`;
    } else if (eventName.includes("delivered") && log.status !== "sent") {
      patch.status = "sent";
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("email_logs")
      .update(patch)
      .eq("id", log.id);

    if (updateError) {
      skipped += 1;
      continue;
    }

    updated += 1;
  }

  return ok({ processed, updated, skipped });
}
