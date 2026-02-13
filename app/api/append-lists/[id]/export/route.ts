import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendListPerson, appendListTable } from "@/lib/db/schema";
import {
  getJoinIdentityCandidates,
  isWhitelistedListOwnerEmail,
} from "@/lib/list-owner-whitelist";

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csvCell = (value: string | null | undefined) => escapeCsv(value ?? "");
const formatJoiningTime = (value: Date | null) => {
  if (!value) {
    return "";
  }

  const ist = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    ist.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")} IST`;
};

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
    .where(eq(appendListTable.id, listId));

  if (!list) {
    return NextResponse.json({ error: "Append list not found" }, { status: 404 });
  }

  let canExport = list.listOwner === session.user.id;

  if (!canExport) {
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

      if (identityCondition) {
        const [joined] = await db
          .select({ id: appendListPerson.id })
          .from(appendListPerson)
          .where(
            and(eq(appendListPerson.appendListId, listId), identityCondition),
          );

        canExport = Boolean(joined);
      }
    }
  }

  if (!canExport) {
    return NextResponse.json(
      {
        error:
          "Not allowed. You must own this list or be whitelisted and joined.",
      },
      { status: 403 },
    );
  }

  const people = await db
    .select({
      name: appendListPerson.name,
      emailId: appendListPerson.emailId,
      registerNo: appendListPerson.registerNo,
      joiningTime: appendListPerson.createdAt,
    })
    .from(appendListPerson)
    .where(eq(appendListPerson.appendListId, listId));

  const csvRows = [
    "name,emailid,register_no,joining_time",
    ...people.map((person) =>
      [
        csvCell(person.name),
        csvCell(person.emailId),
        csvCell(person.registerNo),
        csvCell(formatJoiningTime(person.joiningTime)),
      ].join(","),
    ),
  ];
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
