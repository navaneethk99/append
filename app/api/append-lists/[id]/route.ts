import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListPerson, appendListTable } from "@/lib/db/schema";
import {
  getJoinIdentityCandidates,
  isWhitelistedListOwnerEmail,
} from "@/lib/list-owner-whitelist";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listId } = await params;
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const [list] = await db
    .select()
    .from(appendListTable)
    .where(eq(appendListTable.id, listId));

  if (!list) {
    return NextResponse.json({ error: "Append list not found" }, { status: 404 });
  }

  const people = await db
    .select()
    .from(appendListPerson)
    .where(eq(appendListPerson.appendListId, listId));

  const isOwner = session?.user ? list.listOwner === session.user.id : false;
  let canDownload = isOwner;

  if (!canDownload && session?.user) {
    const isWhitelisted = isWhitelistedListOwnerEmail(session.user.email);
    const identityCandidates = getJoinIdentityCandidates(session.user);
    const emailId = session.user.email?.trim() ?? null;

    if (isWhitelisted && (emailId || identityCandidates.length > 0)) {
      const nameCondition =
        identityCandidates.length === 0
          ? null
          : identityCandidates.length === 1
            ? eq(appendListPerson.name, identityCandidates[0])
            : or(
                ...identityCandidates.map((name) =>
                  eq(appendListPerson.name, name),
                ),
              );
      const identityCondition =
        emailId && nameCondition
          ? or(eq(appendListPerson.emailId, emailId), nameCondition)
          : emailId
            ? eq(appendListPerson.emailId, emailId)
            : nameCondition;

      if (!identityCondition) {
        return NextResponse.json({
          list,
          people,
          permissions: { isOwner, canDownload },
        });
      }

      const [joined] = await db
        .select({ id: appendListPerson.id })
        .from(appendListPerson)
        .where(
          and(eq(appendListPerson.appendListId, listId), identityCondition),
        );

      canDownload = Boolean(joined);
    }
  }

  return NextResponse.json({ list, people, permissions: { isOwner, canDownload } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: listId } = await params;

  const [deleted] = await db
    .delete(appendListTable)
    .where(
      and(
        eq(appendListTable.id, listId),
        eq(appendListTable.listOwner, session.user.id),
      ),
    )
    .returning({ id: appendListTable.id });

  if (!deleted) {
    return NextResponse.json(
      { error: "Append list not found or not owned by you" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
