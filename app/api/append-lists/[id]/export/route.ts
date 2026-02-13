import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListPerson, appendListTable } from "@/lib/db/schema";

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

export async function GET(
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

  const [list] = await db
    .select()
    .from(appendListTable)
    .where(
      and(
        eq(appendListTable.id, listId),
        eq(appendListTable.listOwner, session.user.id),
      ),
    );

  if (!list) {
    return NextResponse.json(
      { error: "Append list not found or not owned by you" },
      { status: 404 },
    );
  }

  const people = await db
    .select({ name: appendListPerson.name })
    .from(appendListPerson)
    .where(eq(appendListPerson.appendListId, listId));

  const csvRows = ["name", ...people.map((person) => escapeCsv(person.name))];
  const csv = `${csvRows.join("\n")}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${list.title
        .replace(/\s+/g, "-")
        .toLowerCase()}-names.csv"`,
    },
  });
}
