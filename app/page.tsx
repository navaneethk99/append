"use client";

import { useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";

type AppendList = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  listOwner: string;
};

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [lists, setLists] = useState<AppendList[]>([]);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [exportingListId, setExportingListId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const loadLists = async () => {
      if (!session?.user) {
        setLists([]);
        return;
      }

      const response = await fetch("/api/append-lists", {
        method: "GET",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { lists: AppendList[] };
      setLists(payload.lists);
    };

    void loadLists();
  }, [session?.user]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    window.location.reload();
  };

  const handleOpenCreateModal = () => {
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setNewTitle("");
    setNewDescription("");
    setCreateError(null);
  };

  const handleAddAppendList = async () => {
    const title = newTitle.trim();
    const description = newDescription.trim();

    if (!title || !description) {
      setCreateError("Both name and description are required.");
      return;
    }

    setIsCreating(true);

    const response = await fetch("/api/append-lists", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, description }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { list: AppendList };
      setLists((current) => [payload.list, ...current]);
      handleCloseCreateModal();
    } else {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setCreateError(payload.error ?? "Could not create append list.");
    }

    setIsCreating(false);
  };

  const handleCopyLink = async (listId: string) => {
    const url = `${window.location.origin}/append-list/${listId}`;
    await navigator.clipboard.writeText(url);
    setCopiedListId(listId);
    setTimeout(() => setCopiedListId(null), 1500);
  };

  const handleDeleteList = async (listId: string) => {
    setDeletingListId(listId);

    const response = await fetch(`/api/append-lists/${listId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setLists((current) => current.filter((list) => list.id !== listId));
    }

    setDeletingListId(null);
  };

  const handleExportCsv = async (list: AppendList) => {
    setExportingListId(list.id);

    const response = await fetch(`/api/append-lists/${list.id}/export`, {
      method: "GET",
    });

    if (!response.ok) {
      setExportingListId(null);
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

    setExportingListId(null);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="w-full max-w-2xl rounded-2xl border border-white/40 bg-white/85 p-8 shadow-xl backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Append
        </p>

        {isPending ? (
          <>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Checking session
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Please wait while we verify your sign-in.
            </p>
          </>
        ) : session?.user ? (
          <>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Welcome back, {session.user.name}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              You are signed in as {session.user.email}.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                disabled={isCreating}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isCreating ? "Creating..." : "Add Append List"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>

            <div className="mt-8 space-y-3">
              {lists.length === 0 ? (
                <p className="text-sm text-slate-600">No append lists yet.</p>
              ) : (
                lists.map((list) => (
                  <article
                    key={list.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <h2 className="text-base font-semibold text-slate-900">
                      {list.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">{list.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created on {new Date(list.createdAt).toLocaleDateString()}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(list.id)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        {copiedListId === list.id ? "Copied" : "Click to Copy"}
                      </button>
                      <a
                        href={`/append-list/${list.id}`}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-sky-700"
                      >
                        Join Append List
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteList(list.id)}
                        disabled={deletingListId === list.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {deletingListId === list.id ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportCsv(list)}
                        disabled={exportingListId === list.id}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {exportingListId === list.id
                          ? "Exporting..."
                          : "Export as CSV"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            {showCreateModal ? (
              <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/35 px-4">
                <div className="w-full max-w-lg rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur">
                  <h2 className="text-xl font-semibold text-slate-900">
                    Create Append List
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter a name and description for your new append list.
                  </p>

                  <div className="mt-5 space-y-3">
                    <input
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      placeholder="Append list name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring"
                    />
                    <textarea
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      placeholder="Append list description"
                      className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring"
                    />
                    {createError ? (
                      <p className="text-sm font-medium text-red-600">{createError}</p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={handleAddAppendList}
                      disabled={isCreating}
                      className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreating ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseCreateModal}
                      disabled={isCreating}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Sign up in one click with Google.
            </p>
            <div className="mt-8">
              <GoogleSignInButton />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
