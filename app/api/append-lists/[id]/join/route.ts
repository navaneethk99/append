import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListPerson, appendListTable } from "@/lib/db/schema";

export async function POST(
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
  const name =
    session.user.name?.trim() || session.user.email?.trim() || "Anonymous";

  const [list] = await db
    .select({ id: appendListTable.id })
    .from(appendListTable)
    .where(eq(appendListTable.id, listId));

  if (!list) {
    return NextResponse.json({ error: "Append list not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(appendListPerson)
    .where(
      and(
        eq(appendListPerson.appendListId, listId),
        eq(appendListPerson.name, name),
      ),
    );

  if (existing) {
    return NextResponse.json({ person: existing }, { status: 200 });
  }

  const [person] = await db
    .insert(appendListPerson)
    .values({
      id: randomUUID(),
      appendListId: listId,
      name,
      createdAt: new Date(),
    })
    .returning();

  return NextResponse.json({ person }, { status: 201 });
}
