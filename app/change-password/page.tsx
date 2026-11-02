
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
      setError("رمز جدید باید حداقل ۱۲ کاراکتر باشد.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("تکرار رمز جدید مطابقت ندارد.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("رمز جدید باید با رمز قبلی متفاوت باشد.");
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
        throw new Error("ابتدا وارد حساب کاربری خود شوید.");
      }

      const { error: loginError } =
        await db.auth.signInWithPassword({
          email: userData.user.email,
          password: currentPassword,
        });

      if (loginError) {
        throw new Error("رمز عبور فعلی اشتباه است.");
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
      setSuccess("رمز عبور با موفقیت تغییر کرد.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "خطایی رخ داده است."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        maxWidth: 440,
        margin: "60px auto",
        padding: 24,
      }}
    >
      <h1>🔐 تغییر رمز عبور</h1>
      <p>برای امنیت حساب خود، رمز فعلی را تأیید کنید.</p>

      <form onSubmit={submit}>
        <label>
          رمز عبور فعلی
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>

        <label>
          رمز عبور جدید
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
          تکرار رمز عبور جدید
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
          {busy ? "در حال بررسی..." : "ثبت رمز عبور جدید"}
        </button>
      </form>

      <p>
        <a href="/">بازگشت به داشبورد</a>
      </p>
    </main>
  );
}
