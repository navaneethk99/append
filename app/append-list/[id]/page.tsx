"use client";

import { useEffect, useState } from "react";
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

export default function JoinAppendListPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id;
  const { data: session, isPending } = authClient.useSession();
  const [list, setList] = useState<AppendList | null>(null);
  const [people, setPeople] = useState<AppendPerson[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!listId) {
        return;
      }

      const response = await fetch(`/api/append-lists/${listId}`);

      if (!response.ok) {
        setError("This append list could not be found.");
        return;
      }

      const payload = (await response.json()) as {
        list: AppendList;
        people: AppendPerson[];
      };

      setList(payload.list);
      setPeople(payload.people);
    };

    void load();
  }, [listId]);

  const handleJoin = async () => {
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
    setIsJoining(false);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="w-full max-w-xl rounded-2xl border border-white/40 bg-white/85 p-8 shadow-xl backdrop-blur">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !list ? (
          <p className="text-sm text-slate-600">Loading append list...</p>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {list.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{list.description}</p>

            <div className="mt-6">
              {isPending ? (
                <p className="text-sm text-slate-600">Checking your session...</p>
              ) : session?.user ? (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isJoining ? "Joining..." : "Join Append List"}
                </button>
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
