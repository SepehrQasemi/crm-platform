import { env } from "@/lib/env";

type SendEmailInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
};

export async function sendBrevoEmail(input: SendEmailInput) {
  if (!env.brevoApiKey) {
    return { ok: false, error: "BREVO_API_KEY is missing" };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.brevoApiKey,
    },
    body: JSON.stringify({
      sender: {
        name: "CRM Platform",
        email: "no-reply@crm-food-trading.local",
      },
      to: [
        {
          email: input.toEmail,
          name: input.toName ?? undefined,
        },
      ],
      subject: input.subject,
      textContent: input.text,
    }),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: json?.message ?? `Brevo error (${response.status})`,
      payload: json,
    };
  }

  return {
    ok: true,
    messageId: json?.messageId as string | undefined,
    payload: json,
  };
}
