const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoWebhookSecret: process.env.BREVO_WEBHOOK_SECRET ?? "",
  biApiKey: process.env.BI_API_KEY ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "CRM Platform",
  cronSecret: process.env.CRON_SECRET ?? "",
};
