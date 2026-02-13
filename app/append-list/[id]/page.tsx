"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Github } from "lucide-react";
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
  normalizeSearchValue(query).split(/\s+/).filter(Boolean);

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
  }, [detail?.list.type, session?.user?.id]);

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
          const payload = (await response.json()) as {
            username?: string | null;
          };
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

      const header =
        payload.listType === "github"
          ? "name,emailid,register_no,github_username,joining_time"
          : payload.listType === "others"
            ? "name,emailid,register_no,input_1,joining_time"
            : "name,emailid,register_no,joining_time";

      const csvRows = [
        header,
        ...payload.rows.map((person) =>
          payload.listType === "github"
            ? [
                csvCell(person.name),
                csvCell(person.emailId),
                csvCell(person.registerNo),
                csvCell(person.githubUsername),
                csvCell(person.joiningTime),
              ].join(",")
            : payload.listType === "others"
              ? [
                  csvCell(person.name),
                  csvCell(person.emailId),
                  csvCell(person.registerNo),
                  csvCell((person.input1 ?? []).join(" | ")),
                  csvCell(person.joiningTime),
                ].join(",")
              : [
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
          : payload.listType === "others"
            ? payload.rows
                .map((person, index) => {
                  const items = (person.input1 ?? [])
                    .map((item) => item.trim())
                    .filter(Boolean);
                  const registerNo = person.registerNo?.trim();
                  const suffix = items.length
                    ? ` [ ${items.join(" | ")} ]`
                    : "";
                  return `${index + 1}. ${person.name}${
                    registerNo ? ` ${registerNo}` : ""
                  }${suffix}`;
                })
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
      const inputValues =
        detail.list.type === "others" ? (person.input1 ?? []) : [];
      const searchKey = buildSearchKey([
        person.name,
        person.registerNo,
        person.githubUsername,
        ...inputValues,
      ]);

      const displayName =
        detail.list.type === "github" && person.githubUsername
          ? `${person.name} (${person.githubUsername})`
          : person.name;

      return {
        ...person,
        displayName,
        searchKey,
      };
    });
  }, [detail?.people, detail?.list.type]);

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
      <main className="acm-bg-dot-grid relative min-h-screen overflow-hidden px-6 py-12">
        <div className="acm-glow-ball left-[-60px] top-20 bg-[#F95F4A]" />
        <div className="acm-glow-ball bottom-[-140px] right-[-40px] bg-[#FF007A]" />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="acm-label">Append List</p>
              <h1 className="acm-heading-display text-3xl md:text-4xl">Feed</h1>
              <p className="text-sm text-white/70">
                Join, search, and export append lists from the live control
                surface.
              </p>
            </div>
            <Link href="/" className="acm-btn-ghost text-xs">
              Go Back
            </Link>
          </header>

          <section className="acm-card">
            <div className="relative z-10 space-y-6">
              {error ? (
                <p className="text-sm font-medium text-rose-300">{error}</p>
              ) : null}

              {detail === undefined ? (
                <p className="text-sm text-white/70">Loading append list...</p>
              ) : !detail ? (
                <p className="text-sm text-white/70">
                  This append list could not be found.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="acm-heading text-lg text-white">
                        {detail.list.title}
                      </h2>
                      <p className="mt-2 text-sm text-white/70">
                        {detail.list.description}
                      </p>
                    </div>
                    <span className="acm-pill">Type {detail.list.type}</span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {isPending ? (
                      <p className="text-sm text-white/70">
                        Checking your session...
                      </p>
                    ) : session?.user ? (
                      <>
                        <button
                          type="button"
                          onClick={
                            detail.permissions.hasJoined
                              ? handleLeave
                              : handleJoinClick
                          }
                          disabled={isJoining || isLeaving}
                          className="acm-btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-70"
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
                              className="acm-btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isExporting
                                ? "Downloading..."
                                : "Download List CSV"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyList}
                              disabled={isCopying}
                              className="acm-btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-70"
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
                        <p className="text-sm text-white/70">
                          Sign in first, then click join append list.
                        </p>
                        <GoogleSignInButton />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <h3 className="acm-heading text-sm">
                        People in this list
                      </h3>
                      <span className="acm-label">
                        {detail.people.length} entries
                      </span>
                    </div>

                    {detail.people.length > 0 ? (
                      <div className="space-y-2">
                        <input
                          value={searchQuery}
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          placeholder="Search name, reg no, GitHub username, inputs"
                          className="acm-input text-sm"
                        />
                        <p className="text-xs text-white/50">
                          Showing {filteredPeople.length} of{" "}
                          {detail.people.length}
                        </p>
                      </div>
                    ) : null}

                    {detail.people.length === 0 ? (
                      <p className="text-sm text-white/70">
                        No names added yet.
                      </p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {filteredPeople.map((person) => (
                          <div
                            key={person.id}
                            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/70"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-white/80">
                                {person.displayName}
                              </span>
                              {detail.list.type === "others"
                                ? (person.input1 ?? []).map((item, index) => (
                                    <span
                                      key={`${person.id}-item-${index}`}
                                      className="acm-pill text-[0.6rem]"
                                    >
                                      {item}
                                    </span>
                                  ))
                                : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      {showJoinModal && detail?.list && !detail.permissions.hasJoined ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/70 px-4">
          <div className="acm-card w-full max-w-lg">
            <div className="relative z-10 space-y-5">
              <div>
                <h2 className="acm-heading text-lg">Join Append List</h2>
                <p className="text-sm text-white/70">
                  {detail.list.type === "github"
                    ? "Connect GitHub once. Your GitHub username will be saved and reused."
                    : "Add one or more input values to join this list."}
                </p>
              </div>

              <div className="space-y-3">
                {detail.list.type === "github" ? (
                  <>
                    {githubUsername ? (
                      <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                        Connected GitHub username:{" "}
                        <strong>{githubUsername}</strong>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConnectGithub}
                        disabled={isConnectingGithub}
                        className="acm-btn-ghost w-full justify-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Github
                          className="size-4 text-white/80"
                          aria-hidden="true"
                        />
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
                        className="acm-input text-sm"
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setOtherInputs((current) => [...current, ""])
                      }
                      className="text-xs text-white/60 underline-offset-4 hover:text-white hover:underline"
                    >
                      + Add Input
                    </button>
                  </>
                )}
                {joinModalError ? (
                  <p className="text-sm font-medium text-rose-300">
                    {joinModalError}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                {detail.list.type === "others" ? (
                  <button
                    type="button"
                    onClick={handleConfirmJoin}
                    disabled={isJoining || isConnectingGithub}
                    className="acm-btn-primary flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isJoining ? "Joining..." : "Join"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCloseJoinModal}
                  disabled={isJoining}
                  className="acm-btn-ghost flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
