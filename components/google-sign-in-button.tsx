"use client";

import { useState } from "react";
import { Chrome } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    let callbackURL = "/";

    if (typeof window !== "undefined") {
      callbackURL = window.location.href;

      const params = new URLSearchParams(window.location.search);
      const candidate =
        params.get("returnTo") ||
        params.get("redirect") ||
        params.get("from") ||
        params.get("callbackUrl");

      if (candidate) {
        try {
          const parsed = new URL(candidate, window.location.origin);
          if (parsed.origin === window.location.origin) {
            callbackURL = parsed.toString();
          }
        } catch {
          // Ignore invalid callback URL candidates.
        }
      }
    }

    await authClient.signIn.social({
      provider: "google",
      callbackURL,
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
