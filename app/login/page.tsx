"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();

    const { error } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            `${window.location.origin}/auth/callback`,
        },
      });

    if (error) {
      console.error(error);
      alert("Google 登入失敗");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          Enterprise Knowledge System
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          企業 SOP 助理
        </h1>

        <p className="mt-3 text-slate-600">
          請使用公司 Google 帳號登入。
        </p>

        <button
          onClick={signInWithGoogle}
          className="mt-8 w-full rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
        >
          使用 Google 登入
        </button>
      </div>
    </main>
  );
}