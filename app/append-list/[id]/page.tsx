"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { convexFunctions } from "@/lib/convex-functions";

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csvCell = (value: string | null | undefined) => escapeCsv(value ?? "");

export default function JoinAppendListPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id;
  const { data: session, isPending } = authClient.useSession();
  const convex = useConvex();
  const joinList = useMutation(convexFunctions.joinList);
  const leaveList = useMutation(convexFunctions.leaveList);

  const detail = useQuery(
    convexFunctions.getListDetail,
    listId
      ? {
          listId,
          viewer: session?.user
            ? {
                id: session.user.id,
                email: session.user.email ?? undefined,
                name: session.user.name ?? undefined,
              }
            : undefined,
        }
      : "skip",
  );

  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleJoin = async () => {
    setError(null);

    if (!listId || !session?.user) {
      setError("Please sign in to join this append list.");
      return;
    }

    setIsJoining(true);

    try {
      await joinList({
        listId,
        userId: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      });
    } catch {
      setError("Could not append your name. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    setError(null);

    if (!listId || !session?.user) {
      setError("Please sign in to leave this append list.");
      return;
    }

    setIsLeaving(true);

    try {
      await leaveList({
        listId,
        userId: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      });
    } catch {
      setError("Could not remove your name. Please try again.");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleExportCsv = async () => {
    if (!listId || !detail?.list || !session?.user) {
      return;
    }

    setError(null);
    setIsExporting(true);

    try {
      const payload = await convex.query(convexFunctions.getExportRows, {
        listId,
        viewer: {
          id: session.user.id,
          email: session.user.email ?? undefined,
          name: session.user.name ?? undefined,
        },
      });

      const csvRows = [
        "name,emailid,register_no,joining_time",
        ...payload.rows.map((person) =>
          [
            csvCell(person.name),
            csvCell(person.emailId),
            csvCell(person.registerNo),
            csvCell(person.joiningTime),
          ].join(","),
        ),
      ];

      const blob = new Blob([`${csvRows.join("\n")}\n`], {
        type: "text/csv;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${payload.listTitle
        .replace(/\s+/g, "-")
        .toLowerCase()}-names.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download list. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyList = async () => {
    if (!listId || !detail?.list || !session?.user) {
      return;
    }

    setError(null);
    setCopySuccess(false);
    setIsCopying(true);

    try {
      const payload = await convex.query(convexFunctions.getExportRows, {
        listId,
        viewer: {
          id: session.user.id,
          email: session.user.email ?? undefined,
          name: session.user.name ?? undefined,
        },
      });

      const formatted = payload.rows
        .map((person, index) =>
          `${index + 1}. ${person.name}`,
        )
        .join("\n");

      await navigator.clipboard.writeText(formatted);
      setCopySuccess(true);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch {
      setError("Could not copy list. Please try again.");
    } finally {
      setIsCopying(false);
    }
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

        {detail === undefined ? (
          <p className="mt-4 text-sm text-slate-600">Loading append list...</p>
        ) : !detail ? (
          <p className="mt-4 text-sm text-slate-600">
            This append list could not be found.
          </p>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {detail.list.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{detail.list.description}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {isPending ? (
                <p className="text-sm text-slate-600">Checking your session...</p>
              ) : session?.user ? (
                <>
                  <button
                    type="button"
                    onClick={detail.permissions.hasJoined ? handleLeave : handleJoin}
                    disabled={isJoining || isLeaving}
                    className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {detail.permissions.hasJoined
                      ? isLeaving
                        ? "Leaving..."
                        : "Leave Append List"
                      : isJoining
                        ? "Joining..."
                        : "Join Append List"}
                  </button>
                  {detail.permissions.canDownload ? (
                    <>
                      <button
                        type="button"
                        onClick={handleExportCsv}
                        disabled={isExporting}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isExporting ? "Downloading..." : "Download List CSV"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyList}
                        disabled={isCopying}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isCopying
                          ? "Copying..."
                          : copySuccess
                            ? "Copied"
                            : "Copy List"}
                      </button>
                    </>
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
              {detail.people.length === 0 ? (
                <p className="text-sm text-slate-600">No names added yet.</p>
              ) : (
                detail.people.map((person) => (
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
