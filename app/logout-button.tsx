"use client";

import { createBrowserClient } from "@supabase/ssr";

export default function LogoutButton() {
  async function logout() {
    const db = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await db.auth.signOut();

    if (error) {
      alert("خروج از حساب انجام نشد. دوباره تلاش کنید.");
      return;
    }

    window.location.href = "/login";
  }

  return (
    <button type="button" onClick={logout}>
      خروج از حساب
    </button>
  );
}
