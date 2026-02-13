import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListPerson, appendListTable } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listId } = await params;

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

  return NextResponse.json({ list, people });
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
