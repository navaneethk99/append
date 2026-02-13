"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import webPush from "web-push";

export const sendPushNotification: ReturnType<typeof action> = action({
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
