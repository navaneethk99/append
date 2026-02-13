import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListTable } from "@/lib/db/schema";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lists = await db
    .select()
    .from(appendListTable)
    .where(eq(appendListTable.listOwner, session.user.id))
    .orderBy(desc(appendListTable.createdAt));

  return NextResponse.json({ lists });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
  };
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const createdAt = new Date();

  const [created] = await db
    .insert(appendListTable)
    .values({
      id: randomUUID(),
      title,
      description,
      listOwner: session.user.id,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();

  return NextResponse.json({ list: created }, { status: 201 });
}
