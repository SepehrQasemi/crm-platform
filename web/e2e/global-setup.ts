import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertSafeE2ETarget } from "./e2e-target-guard";

const DEFAULT_E2E_EMAIL = "e2e.admin@crm-food-trading.local";
const DEFAULT_E2E_PASSWORD = "E2E-StrongPass!123";
const DEFAULT_E2E_MANAGER_EMAIL = "e2e.manager@crm-food-trading.local";
const DEFAULT_E2E_MANAGER_PASSWORD = "E2E-StrongPass!123";
const DEFAULT_E2E_COMMERCIAL_EMAIL = "e2e.commercial@crm-food-trading.local";
const DEFAULT_E2E_COMMERCIAL_PASSWORD = "E2E-StrongPass!123";
const DEFAULT_E2E_STANDARD_EMAIL = "e2e.standard@crm-food-trading.local";
const DEFAULT_E2E_STANDARD_PASSWORD = "E2E-StrongPass!123";
const E2E_FULL_NAME = "E2E Admin";

function loadEnvFromFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sep = trimmed.indexOf("=");
    if (sep <= 0) continue;

    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export default async function globalSetup() {
  loadEnvFromFile(path.resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local.",
    );
  }

  assertSafeE2ETarget(supabaseUrl, process.env.E2E_TARGET_SUPABASE_URL);

  const e2eEmail = process.env.E2E_USER_EMAIL ?? DEFAULT_E2E_EMAIL;
  const e2ePassword = process.env.E2E_USER_PASSWORD ?? DEFAULT_E2E_PASSWORD;
  const managerEmail = process.env.E2E_MANAGER_EMAIL ?? DEFAULT_E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD ?? DEFAULT_E2E_MANAGER_PASSWORD;
  const commercialEmail = process.env.E2E_COMMERCIAL_EMAIL ?? DEFAULT_E2E_COMMERCIAL_EMAIL;
  const commercialPassword =
    process.env.E2E_COMMERCIAL_PASSWORD ?? DEFAULT_E2E_COMMERCIAL_PASSWORD;
  const standardEmail = process.env.E2E_STANDARD_EMAIL ?? DEFAULT_E2E_STANDARD_EMAIL;
  const standardPassword = process.env.E2E_STANDARD_PASSWORD ?? DEFAULT_E2E_STANDARD_PASSWORD;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const findUserIdByEmail = async (email: string): Promise<string | null> => {
    const normalized = email.toLowerCase();
    let page = 1;
    const perPage = 200;

    // Paginate through users to avoid relying on a single page.
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw new Error(`Failed to list users: ${error.message}`);
      }

      const users = data.users ?? [];
      const match = users.find((user) => (user.email ?? "").toLowerCase() === normalized);
      if (match) return match.id;

      if (users.length < perPage) return null;
      page += 1;
    }
  };

  const ensureUserWithRole = async ({
    email,
    password,
    fullName,
    role,
    position,
    department,
  }: {
    email: string;
    password: string;
    fullName: string;
    role: "admin" | "manager" | "commercial" | "standard_user";
    position: string;
    department: string;
  }) => {
    let userId = await findUserIdByEmail(email);

    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) {
        throw new Error(`Failed to update E2E user (${email}): ${error.message}`);
      }
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (error || !data.user) {
        throw new Error(`Failed to create E2E user (${email}): ${error?.message ?? "unknown error"}`);
      }
      userId = data.user.id;
    }

    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ").trim() || null;

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      first_name: firstName ?? null,
      last_name: lastName,
      role,
      position,
      department,
    });

    if (profileError) {
      throw new Error(`Failed to upsert E2E profile (${email}): ${profileError.message}`);
    }
  };

  await ensureUserWithRole({
    email: e2eEmail,
    password: e2ePassword,
    fullName: E2E_FULL_NAME,
    role: "admin",
    position: "Head of Sales",
    department: "Sales",
  });

  await ensureUserWithRole({
    email: managerEmail,
    password: managerPassword,
    fullName: "E2E Manager",
    role: "manager",
    position: "Sales Manager",
    department: "Sales",
  });

  await ensureUserWithRole({
    email: commercialEmail,
    password: commercialPassword,
    fullName: "E2E Commercial",
    role: "commercial",
    position: "Account Executive",
    department: "Sales",
  });

  await ensureUserWithRole({
    email: standardEmail,
    password: standardPassword,
    fullName: "E2E Standard User",
    role: "standard_user",
    position: "Coordinator",
    department: "Operations",
  });

  execSync("npm run seed:demo", {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
