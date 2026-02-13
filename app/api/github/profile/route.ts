import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account, userGithubProfile } from "@/lib/db/schema";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ username: null }, { status: 401 });
  }

  const profile = await db
    .select({
      githubUsername: userGithubProfile.githubUsername,
    })
    .from(userGithubProfile)
    .where(eq(userGithubProfile.userId, session.user.id))
    .limit(1);

  return NextResponse.json({
    username: profile[0]?.githubUsername ?? null,
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ username: null }, { status: 401 });
  }

  const body = (await request.json()) as { username?: string };
  const username = body.username?.trim();

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const googleAccount = await db
    .select({ userId: account.userId })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.providerId, "google")),
    )
    .limit(1);

  if (!googleAccount[0]) {
    return NextResponse.json(
      { error: "Google account is required for this profile." },
      { status: 403 },
    );
  }

  const now = new Date();
  await db
    .insert(userGithubProfile)
    .values({
      userId: session.user.id,
      githubUsername: username,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userGithubProfile.userId,
      set: {
        githubUsername: username,
        updatedAt: now,
      },
    });

  return NextResponse.json({ username });
}
