"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    setIsLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="inline-block size-5 rounded-full bg-[conic-gradient(#ea4335_0_90deg,#fbbc05_90deg_180deg,#34a853_180deg_270deg,#4285f4_270deg_360deg)]" />
      {isLoading ? "Connecting to Google..." : "Continue with Google"}
    </button>
  );
}
