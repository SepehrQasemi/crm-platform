"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
        <path
          d="M3 4.5L20 21.5M9.88 9.88A3 3 0 0 0 14.12 14.12M10.73 5.08A10.94 10.94 0 0 1 12 5C16.67 5 20.44 8 22 12c-.49 1.25-1.2 2.39-2.09 3.36M6.61 6.61C4.45 8 2.76 9.89 2 12c1.56 4 5.33 7 10 7 1.85 0 3.59-.47 5.1-1.29"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
      <path
        d="M2 12C3.56 8 7.33 5 12 5s8.44 3 10 7c-1.56 4-5.33 7-10 7S3.56 16 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function LoginPage() {
  const { tr } = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetCooldownUntil, setResetCooldownUntil] = useState(0);
  const [tick, setTick] = useState(Date.now());

  const resetCooldownSeconds = useMemo(
    () => Math.max(0, Math.ceil((resetCooldownUntil - tick) / 1000)),
    [resetCooldownUntil, tick],
  );
  const isResetCooldown = mode === "reset" && resetCooldownSeconds > 0;

  useEffect(() => {
    if (!isResetCooldown) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isResetCooldown]);

  function getFriendlyAuthMessage(rawMessage: string): string {
    const msg = rawMessage.toLowerCase();
    if (
      msg.includes("email rate limit exceeded") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests")
    ) {
      return tr(
        "Password reset requests are temporarily limited. Please wait one minute and try again.",
      );
    }
    if (msg.includes("invalid login credentials")) {
      return tr("Invalid email or password.");
    }
    if (msg.includes("invalid email")) {
      return tr("Invalid email address.");
    }
    return rawMessage;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        router.push("/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) {
          throw new Error(tr("Password must be at least 8 characters."));
        }
        if (password !== confirmPassword) {
          throw new Error(tr("Passwords do not match."));
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split("@")[0],
            },
          },
        });
        if (signUpError) throw signUpError;
        setSuccess(tr("Signup done. Check your inbox for verification if required."));
      } else {
        // Keep recovery on the same origin and route directly to reset page.
        // This is required with implicit flow, where tokens arrive in URL hash.
        const resetUrl = new URL("/reset-password", window.location.origin.replace(/\/$/, ""));
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetUrl.toString(),
        });
        if (resetError) throw resetError;
        setSuccess(tr("Reset link sent. Check inbox and spam."));
        setResetCooldownUntil(Date.now() + 60_000);
      }
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : tr("Unexpected auth error");
      const friendly = getFriendlyAuthMessage(rawMessage);
      setError(friendly);
      if (
        mode === "reset" &&
        friendly ===
          tr("Password reset requests are temporarily limited. Please wait one minute and try again.")
      ) {
        setResetCooldownUntil(Date.now() + 60_000);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <div className="inline-actions auth-head">
          <BrandLogo compact />
          <LanguageSwitcher />
        </div>
        <h1>{tr("CRM Platform")}</h1>
        <p>{tr("Sign in to manage your leads, contacts, and email campaigns.")}</p>
        <div className="row">
          <button
            type="button"
            className={`btn col-6 ${mode === "login" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("login")}
          >
            {tr("Login")}
          </button>
          <button
            type="button"
            className={`btn col-6 ${mode === "signup" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("signup")}
          >
            {tr("Signup")}
          </button>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="stack">
              {tr("Full name")}
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={tr("Your Name")}
                required
              />
            </label>
          )}

          <label className="stack">
            {tr("Email")}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder={tr("Email address placeholder")}
              required
            />
          </label>

          {mode !== "reset" && (
            <div className="stack">
              <label htmlFor="auth-password">{tr("Password")}</label>
              <div className="password-input-wrap">
                <input
                  id="auth-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? tr("Hide password") : tr("Show password")}
                  title={showPassword ? tr("Hide password") : tr("Show password")}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="stack">
              <label htmlFor="auth-confirm-password">{tr("Confirm password")}</label>
              <div className="password-input-wrap">
                <input
                  id="auth-confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="********"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? tr("Hide password") : tr("Show password")}
                  title={showConfirmPassword ? tr("Hide password") : tr("Show password")}
                >
                  <PasswordVisibilityIcon visible={showConfirmPassword} />
                </button>
              </div>
            </div>
          )}

          {mode !== "reset" ? (
            <button type="button" className="btn-link" onClick={() => setMode("reset")}>
              {tr("Forgot password?")}
            </button>
          ) : (
            <button type="button" className="btn-link" onClick={() => setMode("login")}>
              {tr("Back to login")}
            </button>
          )}

          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={loading || isResetCooldown}>
            {loading
              ? tr("Processing...")
              : mode === "login"
                ? tr("Login")
                : mode === "signup"
                  ? tr("Create account")
                  : isResetCooldown
                    ? tr("Retry in {seconds}s", { seconds: resetCooldownSeconds })
                    : tr("Send reset link")}
          </button>
        </form>
      </div>
    </div>
  );
}
