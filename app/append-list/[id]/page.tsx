"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { convexFunctions } from "@/lib/convex-functions";

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csvCell = (value: string | null | undefined) => escapeCsv(value ?? "");

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenizeSearch = (query: string) =>
  normalizeSearchValue(query)
    .split(/\s+/)
    .filter(Boolean);

const buildSearchKey = (parts: Array<string | undefined>) =>
  normalizeSearchValue(parts.filter(Boolean).join(" ")).replace(/\s+/g, "");

const isSubsequence = (needle: string, haystack: string) => {
  if (!needle) {
    return true;
  }

  let needleIndex = 0;
  for (let i = 0; i < haystack.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex === needle.length) {
        return true;
      }
    }
  }

  return false;
};

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
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [otherInputs, setOtherInputs] = useState<string[]>([""]);
  const [joinModalError, setJoinModalError] = useState<string | null>(null);
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [autoJoinGithubRequested, setAutoJoinGithubRequested] = useState(false);
  const [hasAttemptedAutoJoinGithub, setHasAttemptedAutoJoinGithub] =
    useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJoin = useCallback(
    async (options?: { githubUsername?: string; otherInputs?: string[] }) => {
      setError(null);

      if (!listId || !session?.user) {
        setError("Please sign in to join this append list.");
        return false;
      }

      setIsJoining(true);

      try {
        await joinList({
          listId,
          userId: session.user.id,
          name: session.user.name ?? undefined,
          email: session.user.email ?? undefined,
          githubUsername: options?.githubUsername,
          otherInputs: options?.otherInputs,
        });
        return true;
      } catch {
        setError("Could not append your name. Please try again.");
        return false;
      } finally {
        setIsJoining(false);
      }
    },
    [joinList, listId, session?.user],
  );

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const shouldAutoJoin = url.searchParams.get("autoJoinGithub") === "1";
    setAutoJoinGithubRequested(shouldAutoJoin);
    setHasAttemptedAutoJoinGithub(false);
  }, []);

  useEffect(() => {
    setGithubUsername(null);
  }, [session?.user?.id]);

  useEffect(() => {
    if (detail?.list.type !== "github" || !session?.user?.id) {
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/github/profile", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { username?: string | null };
        const username = payload.username?.trim();

        if (!isMounted) {
          return;
        }
        setGithubUsername(username || null);
      } catch {
        if (isMounted) {
          setGithubUsername(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    detail?.list.type,
    session?.user?.id,
  ]);

  useEffect(() => {
    if (
      !autoJoinGithubRequested ||
      hasAttemptedAutoJoinGithub ||
      detail?.list.type !== "github" ||
      detail.permissions.hasJoined ||
      isJoining
    ) {
      return;
    }

    setHasAttemptedAutoJoinGithub(true);
    void (async () => {
      let resolvedUsername = githubUsername;
      if (!resolvedUsername) {
        const response = await fetch("/api/github/username", {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          const payload = (await response.json()) as { username?: string | null };
          const username = payload.username?.trim();
          if (username) {
            const saveResponse = await fetch("/api/github/profile", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({ username }),
            });

            if (saveResponse.ok) {
              resolvedUsername = username;
              setGithubUsername(username);
            }
          }
        }
      }

      if (resolvedUsername) {
        await handleJoin({ githubUsername: resolvedUsername });
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("autoJoinGithub");
      window.history.replaceState({}, "", url.toString());
      setAutoJoinGithubRequested(false);
    })();
  }, [
    autoJoinGithubRequested,
    detail?.list.type,
    detail?.permissions.hasJoined,
    githubUsername,
    handleJoin,
    hasAttemptedAutoJoinGithub,
    isJoining,
  ]);

  useEffect(() => {
    if (
      !showJoinModal ||
      detail?.list.type !== "github" ||
      !githubUsername ||
      detail.permissions.hasJoined ||
      isJoining
    ) {
      return;
    }

    void (async () => {
      const didJoin = await handleJoin({ githubUsername });
      if (didJoin) {
        handleCloseJoinModal();
      }
    })();
  }, [
    detail?.list.type,
    detail?.permissions.hasJoined,
    githubUsername,
    handleJoin,
    isJoining,
    showJoinModal,
  ]);

  const handleOpenJoinModal = () => {
    setJoinModalError(null);
    setOtherInputs([""]);
    setShowJoinModal(true);
  };

  const handleCloseJoinModal = () => {
    setShowJoinModal(false);
    setJoinModalError(null);
    setOtherInputs([""]);
  };

  const handleJoinClick = async () => {
    if (detail?.list.type === "nightslip") {
      await handleJoin();
      return;
    }

    if (detail?.list.type === "github" && githubUsername) {
      await handleJoin({ githubUsername });
      return;
    }

    handleOpenJoinModal();
  };

  const handleConfirmJoin = async () => {
    if (detail?.list.type === "others") {
      const cleaned = otherInputs.map((value) => value.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        setJoinModalError("Add at least one input value.");
        return;
      }

      const didJoin = await handleJoin({ otherInputs: cleaned });
      if (didJoin) {
        handleCloseJoinModal();
      }
    }
  };

  const handleConnectGithub = async () => {
    setJoinModalError(null);
    setIsConnectingGithub(true);
    try {
      const callbackUrl = new URL(window.location.href);
      callbackUrl.searchParams.set("autoJoinGithub", "1");

      const response = await fetch("/api/auth/link-social", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          provider: "github",
          callbackURL: callbackUrl.toString(),
          disableRedirect: true,
        }),
      });

      if (!response.ok) {
        setJoinModalError("Could not connect your GitHub account.");
        return;
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        setJoinModalError("Could not start GitHub authorization.");
        return;
      }

      window.location.href = payload.url;
    } finally {
      setIsConnectingGithub(false);
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

      const formatted =
        payload.listType === "github"
          ? payload.rows
              .map((person) => person.githubUsername?.trim())
              .filter((username): username is string => Boolean(username))
              .map((username, index) => `${index + 1}. ${username}`)
              .join("\n")
          : payload.rows
              .map((person, index) => `${index + 1}. ${person.name}`)
              .join("\n");

      if (!formatted.trim()) {
        setError(
          payload.listType === "github"
            ? "No GitHub usernames to copy yet."
            : "No entries to copy yet.",
        );
        return;
      }

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

  const peopleIndex = useMemo(() => {
    if (!detail?.people) {
      return [];
    }

    return detail.people.map((person) => {
      const searchKey = buildSearchKey([
        person.name,
        person.registerNo,
        person.githubUsername,
      ]);

      return {
        ...person,
        displayName: person.githubUsername
          ? `${person.name} (${person.githubUsername})`
          : person.name,
        searchKey,
      };
    });
  }, [detail?.people]);

  const filteredPeople = useMemo(() => {
    if (peopleIndex.length === 0) {
      return [];
    }

    const tokens = tokenizeSearch(searchQuery);
    if (tokens.length === 0) {
      return peopleIndex;
    }

    return peopleIndex.filter((person) =>
      tokens.every((token) => isSubsequence(token, person.searchKey)),
    );
  }, [peopleIndex, searchQuery]);

  return (
    <>
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
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              Type: {detail.list.type}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {isPending ? (
                <p className="text-sm text-slate-600">Checking your session...</p>
              ) : session?.user ? (
                <>
                  <button
                    type="button"
                    onClick={detail.permissions.hasJoined ? handleLeave : handleJoinClick}
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
              {detail.people.length > 0 ? (
                <div className="space-y-2">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search name, surname, reg no, GitHub username"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring"
                  />
                  <p className="text-xs text-slate-500">
                    Showing {filteredPeople.length} of {detail.people.length}
                  </p>
                </div>
              ) : null}
              {detail.people.length === 0 ? (
                <p className="text-sm text-slate-600">No names added yet.</p>
              ) : (
                filteredPeople.map((person) => (
                  <p
                    key={person.id}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {person.displayName}
                  </p>
                ))
              )}
            </div>
          </>
        )}
        </section>
      </main>
      {showJoinModal && detail?.list && !detail.permissions.hasJoined ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-900">
              Join Append List
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {detail.list.type === "github"
                ? "Connect GitHub once. Your GitHub username will be saved and reused."
                : "Add one or more input values to join this list."}
            </p>

            <div className="mt-5 space-y-3">
              {detail.list.type === "github" ? (
                <>
                  {githubUsername ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Connected GitHub username: <strong>{githubUsername}</strong>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectGithub}
                      disabled={isConnectingGithub}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isConnectingGithub
                        ? "Redirecting to GitHub..."
                        : "Continue with GitHub"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {otherInputs.map((value, index) => (
                    <input
                      key={`${index}`}
                      value={value}
                      onChange={(event) => {
                        setOtherInputs((current) => {
                          const next = current.slice();
                          next[index] = event.target.value;
                          return next;
                        });
                      }}
                      placeholder={`Input ${index + 1}`}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setOtherInputs((current) => [...current, ""])}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    + Add Input
                  </button>
                </>
              )}
              {joinModalError ? (
                <p className="text-sm font-medium text-red-600">{joinModalError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-3">
              {detail.list.type === "others" ? (
                <button
                  type="button"
                  onClick={handleConfirmJoin}
                  disabled={isJoining || isConnectingGithub}
                  className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isJoining ? "Joining..." : "Join"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCloseJoinModal}
                disabled={isJoining}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
