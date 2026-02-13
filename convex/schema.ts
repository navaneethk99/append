import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  appendLists: defineTable({
    publicId: v.string(),
    title: v.string(),
    description: v.string(),
    listType: v.optional(
      v.union(v.literal("nightslip"), v.literal("github"), v.literal("others")),
    ),
    listOwner: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_owner_createdAt", ["listOwner", "createdAt"]),

  appendListPeople: defineTable({
    appendListId: v.id("appendLists"),
    name: v.string(),
    emailId: v.optional(v.string()),
    registerNo: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_list", ["appendListId"])
    .index("by_list_email", ["appendListId", "emailId"])
    .index("by_list_name", ["appendListId", "name"]),

  appendListGithubPeople: defineTable({
    appendListId: v.id("appendLists"),
    name: v.string(),
    emailId: v.optional(v.string()),
    registerNo: v.optional(v.string()),
    githubUsername: v.string(),
    createdAt: v.number(),
  })
    .index("by_list", ["appendListId"])
    .index("by_list_email", ["appendListId", "emailId"])
    .index("by_list_name", ["appendListId", "name"]),

  appendListOtherPeople: defineTable({
    appendListId: v.id("appendLists"),
    name: v.string(),
    emailId: v.optional(v.string()),
    registerNo: v.optional(v.string()),
    input1: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_list", ["appendListId"])
    .index("by_list_email", ["appendListId", "emailId"])
    .index("by_list_name", ["appendListId", "name"]),

  notifications: defineTable({
    title: v.string(),
    message: v.string(),
    createdAt: v.number(),
    createdByEmail: v.optional(v.string()),
  }).index("by_createdAt", ["createdAt"]),

  notificationAcks: defineTable({
    notificationId: v.id("notifications"),
    viewerId: v.string(),
    acknowledgedAt: v.number(),
  })
    .index("by_viewer", ["viewerId"])
    .index("by_viewer_notification", ["viewerId", "notificationId"]),

  pushSubscriptions: defineTable({
    viewerId: v.string(),
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    expirationTime: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_viewer", ["viewerId"])
    .index("by_endpoint", ["endpoint"]),
});
