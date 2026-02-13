import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const REGISTER_NO_PATTERN = /^[0-9]{2}[A-Z]{3}[0-9]{4}$/;
const LIST_TYPE_VALIDATOR = v.union(
  v.literal("nightslip"),
  v.literal("github"),
  v.literal("others"),
);

type ListType = "nightslip" | "github" | "others";
type PeopleTableName =
  | "appendListPeople"
  | "appendListGithubPeople"
  | "appendListOtherPeople";

const normalizeListType = (listType: string | undefined): ListType => {
  if (listType === "github" || listType === "others") {
    return listType;
  }

  return "nightslip";
};

const getPeopleTableName = (listType: ListType): PeopleTableName => {
  if (listType === "github") {
    return "appendListGithubPeople";
  }

  if (listType === "others") {
    return "appendListOtherPeople";
  }

  return "appendListPeople";
};

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

const findJoinedRecord = async (
  db: DatabaseReader,
  tableName: PeopleTableName,
  appendListId: Id<"appendLists">,
  email?: string,
  name?: string,
) => {
  if (email) {
    const joinedByEmail = await db
      .query(tableName)
      .withIndex("by_list_email", (q) =>
        q.eq("appendListId", appendListId).eq("emailId", email),
      )
      .first();

    if (joinedByEmail) {
      return joinedByEmail;
    }
  }

  if (name) {
    const joinedByName = await db
      .query(tableName)
      .withIndex("by_list_name", (q) =>
        q.eq("appendListId", appendListId).eq("name", name),
      )
      .first();

    if (joinedByName) {
      return joinedByName;
    }
  }

  return null;
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
        type: normalizeListType(list.listType),
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
    listType: LIST_TYPE_VALIDATOR,
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
      listType: args.listType,
      listOwner: args.ownerId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: publicId,
      title,
      description,
      type: args.listType,
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

    const deleteRowsByTable = async (tableName: PeopleTableName) => {
      const people = await db
        .query(tableName)
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      for (const person of people) {
        await db.delete(person._id);
      }
    };

    await deleteRowsByTable("appendListPeople");
    await deleteRowsByTable("appendListGithubPeople");
    await deleteRowsByTable("appendListOtherPeople");

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

    const listType = normalizeListType(list.listType);
    const tableName = getPeopleTableName(listType);

    const isOwner = args.viewer?.id === list.listOwner;

    let joined = false;
    if (args.viewer) {
      const email = args.viewer.email?.trim().toLowerCase();
      const name = args.viewer.name?.trim();
      const joinedRecord = await findJoinedRecord(
        db,
        tableName,
        list._id,
        email,
        name,
      );
      joined = Boolean(joinedRecord);
    }

    let peopleForDetail: Array<{
      id: string;
      name: string;
      registerNo?: string;
      githubUsername?: string;
      input1?: string[];
    }> = [];
    if (listType === "github") {
      const people = await db
        .query("appendListGithubPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      peopleForDetail = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          id: person._id,
          name: person.name,
          registerNo: person.registerNo,
          githubUsername: person.githubUsername,
        }));
    } else if (listType === "others") {
      const people = await db
        .query("appendListOtherPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      peopleForDetail = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          id: person._id,
          name: person.name,
          registerNo: person.registerNo,
          input1: person.input1,
        }));
    } else {
      const people = await db
        .query("appendListPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      peopleForDetail = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          id: person._id,
          name: person.name,
          registerNo: person.registerNo,
        }));
    }

    return {
      list: {
        id: list.publicId,
        title: list.title,
        description: list.description,
        type: listType,
      },
      people: peopleForDetail,
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
    githubUsername: v.optional(v.string()),
    otherInputs: v.optional(v.array(v.string())),
  },
  handler: async ({ db }, args) => {
    const list = await db
      .query("appendLists")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.listId))
      .unique();

    if (!list) {
      throw new Error("Append list not found");
    }

    const listType = normalizeListType(list.listType);
    const tableName = getPeopleTableName(listType);

    const name = args.name?.trim() || args.email?.trim() || "Anonymous";
    const email = args.email?.trim().toLowerCase();

    const existing = await findJoinedRecord(
      db,
      tableName,
      list._id,
      email,
      name,
    );

    if (existing) {
      return { person: { id: existing._id, name: existing.name } };
    }

    const createdAt = Date.now();

    if (listType === "github") {
      const githubUsername = args.githubUsername?.trim();

      if (!githubUsername) {
        throw new Error("GitHub username is required");
      }

      const personId = await db.insert("appendListGithubPeople", {
        appendListId: list._id,
        name,
        emailId: email,
        registerNo: extractRegisterNo(args.name),
        githubUsername,
        createdAt,
      });

      return { person: { id: personId, name } };
    }

    if (listType === "others") {
      const input1 = (args.otherInputs ?? [])
        .map((value) => value.trim())
        .filter(Boolean);

      if (input1.length === 0) {
        throw new Error("At least one input is required");
      }

      const personId = await db.insert("appendListOtherPeople", {
        appendListId: list._id,
        name,
        emailId: email,
        registerNo: extractRegisterNo(args.name),
        input1,
        createdAt,
      });

      return { person: { id: personId, name } };
    }

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

    const listType = normalizeListType(list.listType);
    const tableName = getPeopleTableName(listType);

    const email = args.email?.trim().toLowerCase();
    const name = args.name?.trim();

    const existing = await findJoinedRecord(
      db,
      tableName,
      list._id,
      email,
      name,
    );

    if (existing) {
      await db.delete(existing._id);
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

    const listType = normalizeListType(list.listType);
    const tableName = getPeopleTableName(listType);

    const isOwner = args.viewer.id === list.listOwner;
    let joined = isOwner;

    if (!joined) {
      const email = args.viewer.email?.trim().toLowerCase();
      const name = args.viewer.name?.trim();
      const joinedRecord = await findJoinedRecord(
        db,
        tableName,
        list._id,
        email,
        name,
      );
      joined = Boolean(joinedRecord);
    }

    if (!isOwner && !joined) {
      throw new Error("Not allowed to export this list");
    }

    let rows: Array<{
      name: string;
      emailId?: string;
      registerNo?: string;
      githubUsername?: string;
      input1?: string[];
      joiningTime: string;
    }> = [];

    if (listType === "github") {
      const people = await db
        .query("appendListGithubPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      rows = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          name: person.name,
          emailId: person.emailId,
          registerNo: person.registerNo,
          githubUsername: person.githubUsername,
          joiningTime: formatJoiningTime(person.createdAt),
        }));
    } else if (listType === "others") {
      const people = await db
        .query("appendListOtherPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      rows = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          name: person.name,
          emailId: person.emailId,
          registerNo: person.registerNo,
          input1: person.input1,
          joiningTime: formatJoiningTime(person.createdAt),
        }));
    } else {
      const people = await db
        .query("appendListPeople")
        .withIndex("by_list", (q) => q.eq("appendListId", list._id))
        .collect();

      rows = people
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((person) => ({
          name: person.name,
          emailId: person.emailId,
          registerNo: person.registerNo,
          joiningTime: formatJoiningTime(person.createdAt),
        }));
    }

    return {
      listTitle: list.title,
      listType,
      rows,
    };
  },
});
