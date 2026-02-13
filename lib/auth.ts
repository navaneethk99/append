import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is not set");
}

if (!googleClientId || !googleClientSecret) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
}

const allowedEmailDomain = "vitstudent.ac.in";

const assertAllowedEmailDomain = (email?: string | null) => {
  if (!email) {
    throw new APIError("BAD_REQUEST", {
      message: "Email is required",
    });
  }

  const domain = email.toLowerCase().split("@")[1];
  if (domain !== allowedEmailDomain) {
    throw new APIError("FORBIDDEN", {
      message: `Only ${allowedEmailDomain} email accounts are allowed`,
    });
  }
};

export const auth = betterAuth({
  secret,
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertAllowedEmailDomain(user.email);
        },
      },
      update: {
        before: async (user) => {
          if ("email" in user && user.email) {
            assertAllowedEmailDomain(String(user.email));
          }
        },
      },
    },
  },
});
