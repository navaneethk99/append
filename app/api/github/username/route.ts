import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ username: null, linked: false }, { status: 401 });
  }

  const linkedAccount = await db
    .select({
      accessToken: account.accessToken,
    })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.providerId, "github")),
    )
    .orderBy(desc(account.updatedAt))
    .limit(1);

  const githubAccount = linkedAccount[0];
  if (!githubAccount) {
    return NextResponse.json({ username: null, linked: false });
  }

  if (!githubAccount.accessToken) {
    return NextResponse.json({ username: null, linked: true });
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${githubAccount.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ username: null, linked: true }, { status: 502 });
  }

  const payload = (await response.json()) as { login?: string };
  return NextResponse.json({
    username: payload.login ?? null,
    linked: true,
  });
}
