import { describe, expect, it } from "vitest";
import { assertSafeE2ETarget } from "@/e2e/e2e-target-guard";

describe("assertSafeE2ETarget", () => {
  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
  ])("allows loopback target %s without remote confirmation", (target) => {
    expect(() => assertSafeE2ETarget(target)).not.toThrow();
  });

  it("rejects an unconfirmed remote target", () => {
    expect(() => assertSafeE2ETarget("https://test-project.supabase.co")).toThrow(
      /require E2E_TARGET_SUPABASE_URL/,
    );
  });

  it("rejects a mismatched remote confirmation", () => {
    expect(() =>
      assertSafeE2ETarget(
        "https://test-project.supabase.co",
        "https://different-project.supabase.co",
      ),
    ).toThrow(/does not match/);
  });

  it("allows an exactly confirmed remote origin", () => {
    expect(() =>
      assertSafeE2ETarget(
        "https://test-project.supabase.co/path",
        "https://test-project.supabase.co/another-path",
      ),
    ).not.toThrow();
  });
});