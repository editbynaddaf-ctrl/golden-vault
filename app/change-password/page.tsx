
"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must be different.");
      return;
    }

    setBusy(true);

    try {
      const db = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: userData, error: userError } =
        await db.auth.getUser();

      if (userError || !userData.user?.email) {
        throw new Error("Please sign in first.");
      }

      const { error: loginError } =
        await db.auth.signInWithPassword({
          email: userData.user.email,
          password: currentPassword,
        });

      if (loginError) {
        throw new Error("Current password is incorrect.");
      }

      const { error: updateError } =
        await db.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password successfully changed.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      dir="ltr"
      style={{
        maxWidth: 440,
        margin: "60px auto",
        padding: 24,
      }}
    >
      <h1>🔐 Change Password</h1>
      <p>Confirm your current password to secure your account.</p>

      <form onSubmit={submit}>
        <label>
          Current Password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>

        <label>
          New Password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={12}
            required
          />
        </label>

        <label>
          تکرار New Password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>

        {error && <p role="alert" style={{ color: "#ff8080" }}>{error}</p>}
        {success && <p role="status" style={{ color: "#90e6a8" }}>{success}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "Updating..." : "ثبت New Password"}
        </button>
      </form>

      <p>
        <a href="/">Back to Dashboard</a>
      </p>
    </main>
  );
}
