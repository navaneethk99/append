"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";

type AppendList = {
  id: string;
  title: string;
  description: string;
};

type AppendPerson = {
  id: string;
  name: string;
};

type ListPermissions = {
  isOwner: boolean;
  canDownload: boolean;
};

export default function JoinAppendListPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id;
  const { data: session, isPending } = authClient.useSession();
  const [list, setList] = useState<AppendList | null>(null);
  const [people, setPeople] = useState<AppendPerson[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [permissions, setPermissions] = useState<ListPermissions>({
    isOwner: false,
    canDownload: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listId) {
      return;
    }

    const load = async () => {
      const response = await fetch(`/api/append-lists/${listId}`);

      if (!response.ok) {
        setError("This append list could not be found.");
        return;
      }

      const payload = (await response.json()) as {
        list: AppendList;
        people: AppendPerson[];
        permissions?: ListPermissions;
      };

      setError(null);
      setList(payload.list);
      setPeople(payload.people);
      setPermissions(
        payload.permissions ?? { isOwner: false, canDownload: false },
      );
    };

    void load();
  }, [listId, session?.user?.id]);

  const handleJoin = async () => {
    setError(null);
    setIsJoining(true);

    if (!listId) {
      setIsJoining(false);
      return;
    }

    const response = await fetch(`/api/append-lists/${listId}/join`, {
      method: "POST",
    });

    if (!response.ok) {
      if (response.status === 401) {
        setError("Please sign in to join this append list.");
      } else {
        setError("Could not append your name. Please try again.");
      }
      setIsJoining(false);
      return;
    }

    const payload = (await response.json()) as { person: AppendPerson };
    setPeople((current) => {
      if (current.some((person) => person.id === payload.person.id)) {
        return current;
      }

      return [...current, payload.person];
    });

    const refreshResponse = await fetch(`/api/append-lists/${listId}`);
    if (refreshResponse.ok) {
      const refreshPayload = (await refreshResponse.json()) as {
        list: AppendList;
        people: AppendPerson[];
        permissions?: ListPermissions;
      };
      setError(null);
      setList(refreshPayload.list);
      setPeople(refreshPayload.people);
      setPermissions(
        refreshPayload.permissions ?? { isOwner: false, canDownload: false },
      );
    }
    setIsJoining(false);
  };

  const handleExportCsv = async () => {
    if (!listId || !list) {
      return;
    }

    setError(null);
    setIsExporting(true);

    const response = await fetch(`/api/append-lists/${listId}/export`, {
      method: "GET",
    });

    if (!response.ok) {
      if (response.status === 401) {
        setError("Please sign in to download this list.");
      } else if (response.status === 403) {
        setError("You are not allowed to download this list.");
      } else {
        setError("Could not download list. Please try again.");
      }
      setIsExporting(false);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${list.title.replace(/\s+/g, "-").toLowerCase()}-names.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="w-full max-w-xl rounded-2xl border border-white/40 bg-white/85 p-8 shadow-xl backdrop-blur">
        <Link
          href="/"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Go Back
        </Link>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!list ? (
          <p className="mt-4 text-sm text-slate-600">Loading append list...</p>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {list.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{list.description}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {isPending ? (
                <p className="text-sm text-slate-600">
                  Checking your session...
                </p>
              ) : session?.user ? (
                <>
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={isJoining}
                    className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isJoining ? "Joining..." : "Join Append List"}
                  </button>
                  {permissions.canDownload ? (
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={isExporting}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isExporting ? "Downloading..." : "Download List CSV"}
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Sign in first, then click join append list.
                  </p>
                  <GoogleSignInButton />
                </div>
              )}
            </div>

            <div className="mt-8 space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">
                People in this list
              </h2>
              {people.length === 0 ? (
                <p className="text-sm text-slate-600">No names added yet.</p>
              ) : (
                people.map((person) => (
                  <p
                    key={person.id}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {person.name}
                  </p>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
