import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import webPush from "web-push";

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
  handler: async ({ db, scheduler }, args) => {
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

    await scheduler.runAfter(0, api.notifications.sendPushNotification, {
      notificationId: id,
    });

    return { id, createdAt };
  },
});

export const registerPushSubscription = mutation({
  args: {
    viewerId: v.string(),
    subscription: v.object({
      endpoint: v.string(),
      keys: v.object({
        p256dh: v.string(),
        auth: v.string(),
      }),
      expirationTime: v.optional(v.number()),
    }),
    userAgent: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const now = Date.now();
    const existing = await db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.subscription.endpoint))
      .unique();

    if (existing) {
      await db.patch(existing._id, {
        viewerId: args.viewerId,
        keys: args.subscription.keys,
        expirationTime: args.subscription.expirationTime ?? undefined,
        userAgent: args.userAgent,
        updatedAt: now,
      });
      return { id: existing._id };
    }

    const id = await db.insert("pushSubscriptions", {
      viewerId: args.viewerId,
      endpoint: args.subscription.endpoint,
      keys: args.subscription.keys,
      expirationTime: args.subscription.expirationTime ?? undefined,
      userAgent: args.userAgent,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

export const removePushSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (existing) {
      await db.delete(existing._id);
    }

    return { success: true };
  },
});

export const getPushNotificationPayload = query({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async ({ db }, args) => {
    const notification = await db.get(args.notificationId);
    if (!notification) {
      return null;
    }

    const subscriptions = await db.query("pushSubscriptions").collect();

    return {
      notification: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
        createdByEmail: notification.createdByEmail,
      },
      subscriptions: subscriptions.map((subscription) => ({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        expirationTime: subscription.expirationTime ?? undefined,
      })),
    };
  },
});

export const sendPushNotification = action({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      api.notifications.getPushNotificationPayload,
      { notificationId: args.notificationId },
    );

    if (!payload) {
      return { sent: 0, failed: 0 };
    }

    const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.PUSH_VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      console.warn("Push notifications are not configured.");
      return { sent: 0, failed: payload.subscriptions.length };
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);

    const notificationPayload = JSON.stringify({
      title: payload.notification.title,
      message: payload.notification.message,
      url: "/",
      notificationId: payload.notification.id,
    });

    const results = await Promise.allSettled(
      payload.subscriptions.map((subscription) =>
        webPush.sendNotification(subscription, notificationPayload),
      ),
    );

    let sent = 0;
    let failed = 0;

    await Promise.all(
      results.map(async (result, index) => {
        if (result.status === "fulfilled") {
          sent += 1;
          return;
        }

        failed += 1;
        const error = result.reason as { statusCode?: number };
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          const endpoint = payload.subscriptions[index]?.endpoint;
          if (endpoint) {
            await ctx.runMutation(api.notifications.removePushSubscription, {
              endpoint,
            });
          }
        }
      }),
    );

    return { sent, failed };
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
