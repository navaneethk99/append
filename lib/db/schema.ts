import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/lib/db/auth-schema";

export * from "@/lib/db/auth-schema";

export const appendListTable = pgTable("append_list_table", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  listOwner: text("list_owner")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appendListPerson = pgTable("append_list_person", {
  id: text("id").primaryKey(),
  appendListId: text("append_list_id")
    .notNull()
    .references(() => appendListTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emailId: text("email_id"),
  registerNo: text("register_no"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appendListTableRelations = relations(
  appendListTable,
  ({ one, many }) => ({
    owner: one(user, {
      fields: [appendListTable.listOwner],
      references: [user.id],
    }),
    people: many(appendListPerson),
  }),
);

export const appendListPersonRelations = relations(
  appendListPerson,
  ({ one }) => ({
    list: one(appendListTable, {
      fields: [appendListPerson.appendListId],
      references: [appendListTable.id],
    }),
  }),
);
