"use client";

import { useState } from "react";
import { Chrome } from "lucide-react";
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
      className="acm-btn-ghost w-full justify-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-70"
    >
      <Chrome className="size-4 text-sky-200" aria-hidden="true" />
      {isLoading ? "Connecting to Google..." : "Continue with Google"}
    </button>
  );
}
