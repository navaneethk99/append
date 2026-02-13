import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const parseAdminEmails = (value: string | undefined) => {
  if (!value) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed
          .map((entry) => String(entry).trim().toLowerCase())
          .filter(Boolean),
      );
    }
  } catch {
    // Fallback to comma-separated parsing.
  }

  return new Set(
    value
      .split(",")
      .map((entry) =>
        entry
          .trim()
          .replace(/^\[/, "")
          .replace(/\]$/, "")
          .replace(/^['"]|['"]$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean),
  );
};

const isAdminEmail = (email?: string) => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return parseAdminEmails(process.env.ADMINS).has(normalized);
};

export const getNotificationState = query({
  args: {
    viewerId: v.string(),
    viewerEmail: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const acks = await db
      .query("notificationAcks")
      .withIndex("by_viewer", (q) => q.eq("viewerId", args.viewerId))
      .collect();

    const ackedIds = new Set(acks.map((ack) => ack.notificationId));

    const notifications = await db
      .query("notifications")
      .withIndex("by_createdAt", (q) => q)
      .order("desc")
      .collect();

    const active = notifications
      .filter((notification) => !ackedIds.has(notification._id))
      .map((notification) => ({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
        createdByEmail: notification.createdByEmail,
      }));

    return {
      isAdmin: isAdminEmail(args.viewerEmail),
      notifications: active,
    };
  },
});

export const createNotification = mutation({
  args: {
    viewerId: v.string(),
    viewerEmail: v.string(),
    title: v.string(),
    message: v.string(),
  },
  handler: async ({ db }, args) => {
    if (!isAdminEmail(args.viewerEmail)) {
      throw new Error("Not allowed to post notifications");
    }

    const title = args.title.trim();
    const message = args.message.trim();
    if (!title) {
      throw new Error("Notification title is required");
    }

    if (!message) {
      throw new Error("Notification message is required");
    }

    const createdAt = Date.now();

    const id = await db.insert("notifications", {
      title,
      message,
      createdAt,
      createdByEmail: args.viewerEmail.trim().toLowerCase(),
    });

    await db.insert("notificationAcks", {
      notificationId: id,
      viewerId: args.viewerId,
      acknowledgedAt: createdAt,
    });

    return { id, createdAt };
  },
});

export const acknowledgeNotification = mutation({
  args: {
    notificationId: v.id("notifications"),
    viewerId: v.string(),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("notificationAcks")
      .withIndex("by_viewer_notification", (q) =>
        q.eq("viewerId", args.viewerId).eq("notificationId", args.notificationId),
      )
      .unique();

    if (existing) {
      return { success: true };
    }

    await db.insert("notificationAcks", {
      notificationId: args.notificationId,
      viewerId: args.viewerId,
      acknowledgedAt: Date.now(),
    });

    return { success: true };
  },
});
