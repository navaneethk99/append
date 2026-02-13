import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const REGISTER_NO_PATTERN = /^[0-9]{2}[A-Z]{3}[0-9]{4}$/;

const extractRegisterNo = (name: string | undefined) => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return undefined;
  }

  const tokens = trimmed.split(/\s+/);
  const candidate = tokens[tokens.length - 1]?.toUpperCase();
  if (!candidate || !REGISTER_NO_PATTERN.test(candidate)) {
    return undefined;
  }

  return candidate;
};

const formatJoiningTime = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")} IST`;
};

export const getOwnedLists = query({
  args: {
    ownerId: v.string(),
  },
  handler: async ({ db }, args) => {
    const lists = await db
      .query("appendLists")
      .withIndex("by_owner_createdAt", (q) => q.eq("listOwner", args.ownerId))
      .collect();

    return lists
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((list) => ({
        id: list.publicId,
        title: list.title,
        description: list.description,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        listOwner: list.listOwner,
      }));
  },
});

export const createList = mutation({
  args: {
    ownerId: v.string(),
    title: v.string(),
    description: v.string(),
  },
  handler: async ({ db }, args) => {
    const title = args.title.trim();
    const description = args.description.trim();

    if (!title) {
      throw new Error("Title is required");
    }

    if (!description) {
      throw new Error("Description is required");
    }

    const now = Date.now();
    const publicId = crypto.randomUUID();

    await db.insert("appendLists", {
      publicId,
      title,
      description,
      listOwner: args.ownerId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: publicId,
      title,
      description,
      createdAt: now,
      updatedAt: now,
      listOwner: args.ownerId,
    };
  },
});

export const deleteList = mutation({
  args: {
    listId: v.string(),
    ownerId: v.string(),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list || list.listOwner !== args.ownerId) {
      throw new Error("Append list not found or not owned by you");
    }

    const people = await db
      .query("appendListPeople")
      .withIndex("by_list", (q) => q.eq("appendListId", list._id))
      .collect();

    for (const person of people) {
      await db.delete(person._id);
    }

    await db.delete(list._id);
    return { success: true };
  },
});

export const getListDetail = query({
  args: {
    listId: v.string(),
    viewer: v.optional(
      v.object({
        id: v.string(),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
      }),
    ),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list) {
      return null;
    }

    const people = await db
      .query("appendListPeople")
      .withIndex("by_list", (q) => q.eq("appendListId", list._id))
      .collect();

    const isOwner = args.viewer?.id === list.listOwner;

    let joined = false;
    if (args.viewer) {
      const email = args.viewer.email?.trim().toLowerCase();
      const name = args.viewer.name?.trim();

      if (email) {
        const joinedByEmail = await db
          .query("appendListPeople")
          .withIndex("by_list_email", (q) =>
            q.eq("appendListId", list._id).eq("emailId", email),
          )
          .first();

        joined = Boolean(joinedByEmail);
      }

      if (!joined && name) {
        const joinedByName = await db
          .query("appendListPeople")
          .withIndex("by_list_name", (q) =>
            q.eq("appendListId", list._id).eq("name", name),
          )
          .first();

        joined = Boolean(joinedByName);
      }
    }

    return {
      list: {
        id: list.publicId,
        title: list.title,
        description: list.description,
      },
      people: people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          id: person._id,
          name: person.name,
        })),
      permissions: {
        isOwner,
        hasJoined: joined,
        canDownload: isOwner || joined,
      },
    };
  },
});

export const joinList = mutation({
  args: {
    listId: v.string(),
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list) {
      throw new Error("Append list not found");
    }

    const name = args.name?.trim() || args.email?.trim() || "Anonymous";
    const email = args.email?.trim().toLowerCase();

    if (email) {
      const existingByEmail = await db
        .query("appendListPeople")
        .withIndex("by_list_email", (q) =>
          q.eq("appendListId", list._id).eq("emailId", email),
        )
        .first();

      if (existingByEmail) {
        return { person: { id: existingByEmail._id, name: existingByEmail.name } };
      }
    }

    const existingByName = await db
      .query("appendListPeople")
      .withIndex("by_list_name", (q) =>
        q.eq("appendListId", list._id).eq("name", name),
      )
      .first();

    if (existingByName) {
      return { person: { id: existingByName._id, name: existingByName.name } };
    }

    const createdAt = Date.now();
    const personId = await db.insert("appendListPeople", {
      appendListId: list._id,
      name,
      emailId: email,
      registerNo: extractRegisterNo(args.name),
      createdAt,
    });

    return { person: { id: personId, name } };
  },
});

export const leaveList = mutation({
  args: {
    listId: v.string(),
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list) {
      throw new Error("Append list not found");
    }

    const email = args.email?.trim().toLowerCase();
    const name = args.name?.trim();

    if (email) {
      const existingByEmail = await db
        .query("appendListPeople")
        .withIndex("by_list_email", (q) =>
          q.eq("appendListId", list._id).eq("emailId", email),
        )
        .first();

      if (existingByEmail) {
        await db.delete(existingByEmail._id);
        return { success: true };
      }
    }

    if (name) {
      const existingByName = await db
        .query("appendListPeople")
        .withIndex("by_list_name", (q) =>
          q.eq("appendListId", list._id).eq("name", name),
        )
        .first();

      if (existingByName) {
        await db.delete(existingByName._id);
        return { success: true };
      }
    }

    return { success: true };
  },
});

export const getExportRows = query({
  args: {
    listId: v.string(),
    viewer: v.object({
      id: v.string(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list) {
      throw new Error("Append list not found");
    }

    const isOwner = args.viewer.id === list.listOwner;
    let joined = isOwner;

    if (!joined) {
      const email = args.viewer.email?.trim().toLowerCase();
      const name = args.viewer.name?.trim();

      if (email) {
        const joinedByEmail = await db
          .query("appendListPeople")
          .withIndex("by_list_email", (q) =>
            q.eq("appendListId", list._id).eq("emailId", email),
          )
          .first();

        joined = Boolean(joinedByEmail);
      }

      if (!joined && name) {
        const joinedByName = await db
          .query("appendListPeople")
          .withIndex("by_list_name", (q) =>
            q.eq("appendListId", list._id).eq("name", name),
          )
          .first();

        joined = Boolean(joinedByName);
      }
    }

    if (!isOwner && !joined) {
      throw new Error("Not allowed to export this list");
    }

    const people = await db
      .query("appendListPeople")
      .withIndex("by_list", (q) => q.eq("appendListId", list._id))
      .collect();

    return {
      listTitle: list.title,
      rows: people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          name: person.name,
          emailId: person.emailId,
          registerNo: person.registerNo,
          joiningTime: formatJoiningTime(person.createdAt),
        })),
    };
  },
});
