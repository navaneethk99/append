import type { FunctionReference } from "convex/server";

type QueryRef<
  Args extends Record<string, unknown> = Record<string, never>,
  Result = unknown,
> = FunctionReference<"query", "public", Args, Result>;

type MutationRef<
  Args extends Record<string, unknown> = Record<string, never>,
  Result = unknown,
> = FunctionReference<"mutation", "public", Args, Result>;

const query = <Args extends Record<string, unknown>, Result>(name: string) =>
  name as unknown as QueryRef<Args, Result>;
const mutation = <Args extends Record<string, unknown>, Result>(name: string) =>
  name as unknown as MutationRef<Args, Result>;

export type AppendList = {
  id: string;
  title: string;
  description: string;
  type: "nightslip" | "github" | "others";
  createdAt: number;
  updatedAt: number;
  listOwner: string;
};

export type AppendPerson = {
  id: string;
  name: string;
  registerNo?: string;
  githubUsername?: string;
  input1?: string[];
};

export type ListPermissions = {
  isOwner: boolean;
  hasJoined: boolean;
  canDownload: boolean;
};

export type ListDetail = {
  list: {
    id: string;
    title: string;
    description: string;
    type: "nightslip" | "github" | "others";
  };
  people: AppendPerson[];
  permissions: ListPermissions;
} | null;

export type ExportRows = {
  listTitle: string;
  listType: "nightslip" | "github" | "others";
  rows: Array<{
    name: string;
    emailId?: string;
    registerNo?: string;
    githubUsername?: string;
    input1?: string[];
    joiningTime: string;
  }>;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: number;
  createdByEmail?: string;
};

export type NotificationState = {
  isAdmin: boolean;
  notifications: NotificationItem[];
};

export const convexFunctions = {
  getOwnedLists: query<{ ownerId: string }, AppendList[]>(
    "appendLists:getOwnedLists",
  ),
  createList: mutation<
    {
      ownerId: string;
      title: string;
      description: string;
      listType: "nightslip" | "github" | "others";
    },
    AppendList
  >("appendLists:createList"),
  deleteList: mutation<
    { listId: string; ownerId: string },
    { success: boolean }
  >("appendLists:deleteList"),
  getListDetail: query<
    {
      listId: string;
      viewer?: {
        id: string;
        email?: string;
        name?: string;
      };
    },
    ListDetail
  >("appendLists:getListDetail"),
  joinList: mutation<
    {
      listId: string;
      userId: string;
      name?: string;
      email?: string;
      githubUsername?: string;
      otherInputs?: string[];
    },
    { person: AppendPerson }
  >("appendLists:joinList"),
  leaveList: mutation<
    { listId: string; userId: string; name?: string; email?: string },
    { success: boolean }
  >("appendLists:leaveList"),
  getExportRows: query<
    { listId: string; viewer: { id: string; email?: string; name?: string } },
    ExportRows
  >("appendLists:getExportRows"),
  getNotificationState: query<
    { viewerId: string; viewerEmail?: string },
    NotificationState
  >("notifications:getNotificationState"),
  createNotification: mutation<
    { viewerId: string; viewerEmail: string; title: string; message: string },
    { id: string; createdAt: number }
  >("notifications:createNotification"),
  registerPushSubscription: mutation<
    {
      viewerId: string;
      subscription: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        expirationTime?: number;
      };
      userAgent?: string;
    },
    { id: string }
  >("notifications:registerPushSubscription"),
  acknowledgeNotification: mutation<
    { notificationId: string; viewerId: string },
    { success: boolean }
  >("notifications:acknowledgeNotification"),
};
