export function assertSafeE2ETarget(targetUrl: string, confirmedTargetUrl?: string) {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL before E2E setup can run.");
  }

  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname)) {
    return;
  }

  if (!confirmedTargetUrl) {
    throw new Error(
      "Remote E2E Supabase targets require E2E_TARGET_SUPABASE_URL to confirm the intended test project.",
    );
  }

  let confirmedTarget: URL;
  try {
    confirmedTarget = new URL(confirmedTargetUrl);
  } catch {
    throw new Error("E2E_TARGET_SUPABASE_URL must be a valid URL.");
  }

  if (target.origin !== confirmedTarget.origin) {
    throw new Error(
      "E2E target confirmation does not match NEXT_PUBLIC_SUPABASE_URL; refusing destructive setup.",
    );
  }
}