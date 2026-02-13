const parseEmailWhitelist = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((entry) =>
        entry
          .trim()
          .replace(/^\[/, "")
          .replace(/\]$/, "")
          .replace(/^['"]|['"]$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean),
  );

export const isWhitelistedListOwnerEmail = (email: string | undefined | null) =>
  parseEmailWhitelist(process.env.LIST_OWNER_EMAIL_WHITELIST).has(
    email?.trim().toLowerCase() ?? "",
  );

export const getJoinIdentityCandidates = (user: {
  name?: string | null;
  email?: string | null;
}) => {
  const candidates = [user.name?.trim(), user.email?.trim()].filter(
    (value): value is string => Boolean(value),
  );

  return Array.from(new Set(candidates));
};
