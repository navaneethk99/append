"use client";

import { useEffect, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { convexFunctions, type AppendList } from "@/lib/convex-functions";

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csvCell = (value: string | null | undefined) => escapeCsv(value ?? "");
const listTypeLabel = (type: "names" | "github" | "others") => type;
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};
export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const convex = useConvex();
  const createList = useMutation(convexFunctions.createList);
  const deleteList = useMutation(convexFunctions.deleteList);
  const lists = useQuery(
    convexFunctions.getOwnedLists,
    session?.user?.id ? { ownerId: session.user.id } : "skip",
  );

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [exportingListId, setExportingListId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newListType, setNewListType] = useState<
    "names" | "github" | "others"
  >("names");
  const [createError, setCreateError] = useState<string | null>(null);
  const [showNotificationComposer, setShowNotificationComposer] =
    useState(false);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  useEffect(() => {
    if (session?.user?.id) {
      setViewerId(`user:${session.user.id}`);
    } else {
      setViewerId(null);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (showNotificationComposer) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }

    return;
  }, [showNotificationComposer]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  const notificationState = useQuery(
    convexFunctions.getNotificationState,
    viewerId && session?.user
      ? {
          viewerId,
          viewerEmail: session?.user?.email ?? undefined,
        }
      : "skip",
  );

  const isAdmin = notificationState?.isAdmin ?? false;
  const notifications = notificationState?.notifications ?? [];
  const acknowledgeNotification = useMutation(
    convexFunctions.acknowledgeNotification,
  );
  const createNotification = useMutation(convexFunctions.createNotification);
  const registerPushSubscription = useMutation(
    convexFunctions.registerPushSubscription,
  );

  useEffect(() => {
    if (!viewerId || !session?.user) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return;
    }

    let cancelled = false;

    const setupPush = async () => {
      const registration = await navigator.serviceWorker.register(
        "/notifications-sw.js",
      );

      if (Notification.permission !== "granted") {
        return;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return;
      }

      if (cancelled) {
        return;
      }

      await registerPushSubscription({
        viewerId,
        subscription: {
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          expirationTime: json.expirationTime ?? undefined,
        },
        userAgent: navigator.userAgent,
      });
    };

    setupPush().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    notificationPermission,
    registerPushSubscription,
    session?.user,
    viewerId,
  ]);

  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      return;
    }
  };

  const canSendNotification = useMemo(
    () =>
      Boolean(
        isAdmin &&
        notificationTitle.trim() &&
        notificationMessage.trim() &&
        viewerId &&
        session?.user?.email,
      ),
    [
      isAdmin,
      notificationTitle,
      notificationMessage,
      viewerId,
      session?.user?.email,
    ],
  );

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
    setNewListType("names");
    setCreateError(null);
  };

  const handleAddAppendList = async () => {
    if (!session?.user?.id) {
      return;
    }

    const title = newTitle.trim();
    const description = newDescription.trim();

    if (!title || !description) {
      setCreateError("Both name and description are required.");
      return;
    }

    setIsCreating(true);

    try {
      await createList({
        ownerId: session.user.id,
        title,
        description,
        listType: newListType,
      });
      handleCloseCreateModal();
    } catch {
      setCreateError("Could not create append list.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (listId: string) => {
    const url = `${window.location.origin}/append-list/${listId}`;
    await navigator.clipboard.writeText(url);
    setCopiedListId(listId);
    setTimeout(() => setCopiedListId(null), 1500);
  };

  const handleDeleteList = async (listId: string) => {
    if (!session?.user?.id) {
      return;
    }

    setDeletingListId(listId);

    try {
      await deleteList({ listId, ownerId: session.user.id });
    } finally {
      setDeletingListId(null);
    }
  };

  const downloadCsv = (
    listTitle: string,
    listType: "names" | "github" | "others",
    rows: Array<{
      name: string;
      emailId?: string;
      registerNo?: string;
      githubUsername?: string;
      input1?: string[];
      joiningTime: string;
    }>,
  ) => {
    const header =
      listType === "github"
        ? "name,emailid,register_no,github_username,joining_time"
        : listType === "others"
          ? "name,emailid,register_no,input_1,joining_time"
          : "name,emailid,register_no,joining_time";

    const csvRows = [
      header,
      ...rows.map((person) =>
        listType === "github"
          ? [
              csvCell(person.name),
              csvCell(person.emailId),
              csvCell(person.registerNo),
              csvCell(person.githubUsername),
              csvCell(person.joiningTime),
            ].join(",")
          : listType === "others"
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
    anchor.download = `${listTitle.replace(/\s+/g, "-").toLowerCase()}-names.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async (list: AppendList) => {
    if (!session?.user?.id) {
      return;
    }

    setExportingListId(list.id);

    try {
      const payload = await convex.query(convexFunctions.getExportRows, {
        listId: list.id,
        viewer: {
          id: session.user.id,
          email: session.user.email ?? undefined,
          name: session.user.name ?? undefined,
        },
      });

      downloadCsv(payload.listTitle, payload.listType, payload.rows);
    } finally {
      setExportingListId(null);
    }
  };

  const handleAcknowledgeNotification = async (notificationId: string) => {
    if (!viewerId) {
      return;
    }

    await acknowledgeNotification({ notificationId, viewerId });
  };

  const handleSendNotification = async () => {
    if (!viewerId || !session?.user?.email) {
      return;
    }

    const trimmedTitle = notificationTitle.trim();
    const trimmedMessage = notificationMessage.trim();
    if (!trimmedTitle) {
      setNotificationError("Add a title before sending.");
      return;
    }

    if (!trimmedMessage) {
      setNotificationError("Add a message before sending.");
      return;
    }

    setIsSendingNotification(true);
    setNotificationError(null);

    try {
      await createNotification({
        viewerId,
        viewerEmail: session.user.email,
        title: trimmedTitle,
        message: trimmedMessage,
      });
      setNotificationTitle("");
      setNotificationMessage("");
      setShowNotificationComposer(false);
    } catch {
      setNotificationError("Could not send notification.");
    } finally {
      setIsSendingNotification(false);
    }
  };

  return (
    <>
      <main className="acm-bg-dot-grid relative min-h-screen overflow-hidden px-6 py-12">
        <div className="acm-glow-ball left-[-80px] top-12 bg-[#F95F4A]" />
        <div className="acm-glow-ball bottom-[-120px] right-[-40px] bg-[#FF007A]" />

        <div className="relative z-10 mx-auto h-full flex w-full flex-col gap-10">
          <header className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              {/*<p className="acm-label">ACM-VIT</p>*/}
              <h1 className="acm-heading-display text-4xl md:text-5xl">
                cute-little-append-lists
              </h1>
              <p className="acm-text-body text-sm text-white/70">
                Spin up append lists, invite contributors, and keep the feed
                moving with a control-room experience.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {session?.user ? (
                // <span className="acm-pill">
                //   <span className="acm-status-dot" />
                //   Live
                // </span>
                <></>
              ) : null}
              {session?.user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="acm-btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSigningOut ? "Signing out..." : "Sign out"}
                </button>
              ) : null}
            </div>
          </header>

          <div className="flex h-full w-full justify-center items-center">
            <section className="acm-card acm-card-featured">
              <div className="relative z-10 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/*<div className="acm-pill">Session</div>*/}
                </div>

                {isPending ? (
                  <div className="acm-glass rounded-2xl p-4 text-sm text-white/70">
                    Checking session status...
                  </div>
                ) : session?.user ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <p className="text-sm text-white/70">
                        Signed in as{" "}
                        <span className="text-white">{session.user.email}</span>
                      </p>
                    </div>
                    {notificationPermission === "default" ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 p-4">
                        <div>
                          <p className="text-sm text-white">
                            Enable browser notifications
                          </p>
                          <p className="text-xs text-white/60">
                            Get updates even when this tab is closed.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleEnableNotifications}
                          className="acm-btn-primary text-xs"
                        >
                          Enable
                        </button>
                      </div>
                    ) : null}
                    {notificationPermission === "denied" ? (
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                        <p className="text-sm text-white">
                          Browser notifications blocked
                        </p>
                        <p className="text-xs text-white/60">
                          Update your browser settings to allow notifications.
                        </p>
                      </div>
                    ) : null}
                    {lists === undefined ? (
                      <p className="text-sm text-white/70">
                        Loading your append lists...
                      </p>
                    ) : lists.length === 0 ? (
                      <div className="space-y-3 text-center">
                        <p className="text-sm text-white/70">
                          No append lists yet.
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                          <button
                            type="button"
                            onClick={handleOpenCreateModal}
                            disabled={isCreating}
                            className="acm-btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isCreating ? "Creating..." : "Create Append List"}
                          </button>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => setShowNotificationComposer(true)}
                              className="acm-btn-ghost text-xs"
                            >
                              Create Notification
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap justify-center gap-3">
                          <button
                            type="button"
                            onClick={handleOpenCreateModal}
                            disabled={isCreating}
                            className="acm-btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isCreating ? "Creating..." : "Create Append List"}
                          </button>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => setShowNotificationComposer(true)}
                              className="acm-btn-ghost text-xs"
                            >
                              Create Notification
                            </button>
                          ) : null}
                        </div>
                        {lists.map((list) => (
                          <article
                            key={list.id}
                            className="acm-glass relative rounded-2xl p-4"
                          >
                            <a
                              href={`/append-list/${list.id}`}
                              aria-label={`Open append list ${list.title}`}
                              className="absolute inset-0 rounded-2xl acm-label-hover"
                            />
                            <div className="pointer-events-none relative z-10">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-base font-semibold text-white">
                                    {list.title}
                                  </h3>
                                  <p className="mt-1 text-sm text-white/60">
                                    {list.description}
                                  </p>
                                </div>
                                <span className="acm-pill">
                                  Type {listTypeLabel(list.type)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-white/50">
                                Created on{" "}
                                {new Date(list.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopyLink(list.id)}
                                className="acm-btn-ghost text-[0.65rem]"
                              >
                                {copiedListId === list.id
                                  ? "Copied"
                                  : "Copy Link"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExportCsv(list)}
                                disabled={exportingListId === list.id}
                                className="acm-btn-ghost text-[0.65rem] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {exportingListId === list.id
                                  ? "Exporting..."
                                  : "Export CSV"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteList(list.id)}
                                disabled={deletingListId === list.id}
                                className="acm-btn-ghost acm-btn-danger text-[0.65rem] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingListId === list.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h2 className="acm-heading text-lg">Create your account</h2>
                    <p className="text-sm text-white/70">
                      Sign up in one click with Google to create append lists.
                    </p>
                    <GoogleSignInButton />
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      {showNotificationComposer && isAdmin ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowNotificationComposer(false)}
          />
          <div
            className="relative z-[1] w-full max-w-xl rounded-3xl border border-[#F95F4A66] bg-[#0b0a0a]/95 p-6 shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="acm-label text-xs">Create notification</p>
              <button
                type="button"
                onClick={() => setShowNotificationComposer(false)}
                className="acm-btn-ghost text-[0.65rem]"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <input
                value={notificationTitle}
                onChange={(event) => setNotificationTitle(event.target.value)}
                placeholder="Notification title"
                className="acm-input text-sm"
              />
              <textarea
                value={notificationMessage}
                onChange={(event) => setNotificationMessage(event.target.value)}
                placeholder="Notification details..."
                className="acm-input acm-notification-input text-sm"
                rows={4}
              />
              {notificationError ? (
                <p className="text-xs font-medium text-rose-300">
                  {notificationError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleSendNotification}
                disabled={!canSendNotification || isSendingNotification}
                className="acm-btn-primary w-full text-xs disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSendingNotification ? "Sending..." : "Send notification"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {session?.user && notifications.length ? (
        <aside className="acm-notification-shell">
          {notifications
            .filter(
              (notification) =>
                notification.createdByEmail !== session?.user?.email,
            )
            .map((notification) => (
              <div
                key={notification.id}
                className="acm-notification-card animate-acm-slide-up"
              >
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {notification.title}
                    </p>
                    <p className="text-sm text-white/80">
                      {notification.message}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
                    <span>
                      {new Date(notification.createdAt).toLocaleString()}
                    </span>
                    {notification.createdByEmail ? (
                      <span>From {notification.createdByEmail}</span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcknowledgeNotification(notification.id)}
                  className="acm-btn-ghost text-[0.7rem]"
                >
                  Acknowledge
                </button>
              </div>
            ))}
        </aside>
      ) : null}

      {showCreateModal && session?.user ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/70 px-4">
          <div className="acm-card w-full max-w-lg">
            <div className="relative z-10 space-y-5">
              <div>
                <h2 className="acm-heading text-lg">Create Append List</h2>
                <p className="text-sm text-white/70">
                  Enter a name and description for your new append list.
                </p>
              </div>

              <div className="space-y-3">
                <select
                  value={newListType}
                  onChange={(event) =>
                    setNewListType(
                      event.target.value as "names" | "github" | "others",
                    )
                  }
                  className="acm-input text-sm"
                >
                  <option value="names">names</option>
                  <option value="github">github</option>
                  <option value="others">others</option>
                </select>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Append list name"
                  className="acm-input text-sm"
                />
                <textarea
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="Append list description"
                  className="acm-input min-h-28 text-sm"
                />
                {createError ? (
                  <p className="text-sm font-medium text-rose-300">
                    {createError}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleAddAppendList}
                  disabled={isCreating}
                  className="acm-btn-primary flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCreating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  disabled={isCreating}
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
