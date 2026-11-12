// Private member profile API for Neon Functions (Node.js 24).
// No database URL, token, or user data is embedded in this file.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@neon/functions";

const required = ["DATABASE_URL", "NEON_AUTH_JWKS_URL", "NEON_AUTH_BASE_URL"] as const;
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing server environment: ${name}`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 5 });
attachDatabasePool(pool);

// Separate, narrowly scoped DB credential. Unlike the normal member role,
// only this role can execute the reviewed user-deletion SECURITY DEFINER
// function. It has no direct SELECT/DELETE rights on user or profile tables.
const deletionPool = process.env.OGC_DELETION_DATABASE_URL
  ? new Pool({ connectionString: process.env.OGC_DELETION_DATABASE_URL, max: 2 })
  : null;
if (deletionPool) attachDatabasePool(deletionPool);

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL!).origin;
const allowedOrigins = new Set([
  "https://ogcupid.com",
  "https://www.ogcupid.com",
  "https://ogcupid.onrender.com",
]);
// Local browser testing is allowed ONLY for the isolated development branch.
if (process.env.NEON_BRANCH === "dev/private-member-accounts") {
  allowedOrigins.add("http://localhost:5173");
}

function headersFor(request: Request): Headers {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    h.set("Access-Control-Max-Age", "600");
  }
  return h;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headersFor(request) });
}

async function authenticatedUserId(request: Request): Promise<string | null> {
  const value = request.headers.get("authorization");
  if (!value || !/^Bearer\s+\S+$/i.test(value)) return null;
  try {
    const token = value.replace(/^Bearer\s+/i, "");
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (typeof payload.sub !== "string") return null;
    // Neon managed Better Auth user ids are UUIDs.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) return null;
    return payload.sub.toLowerCase();
  } catch {
    return null;
  }
}

// SET LOCAL prevents a pooled connection from retaining a prior user's identity.
// FORCE ROW LEVEL SECURITY blocks access when the identity is not set.
async function withMember<T>(
  userId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function withDeletionAuthority<T>(
  userId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!deletionPool) throw new Error("Deletion not configured");
  const client = await deletionPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

type MemberProfile = {
  userId: string;
  displayName: string;
  aboutMe: string;
  createdAt: string;
  updatedAt: string;
};

function present(row: Record<string, unknown>): MemberProfile {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    aboutMe: String(row.about_me),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
      return json(request, { error: "Forbidden origin" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headersFor(request) });
    }

    const url = new URL(request.url);
    const profilePath = url.pathname === "/profile" || url.pathname === "/profile/";
    const deletePath = url.pathname === "/account/delete" || url.pathname === "/account/delete/";
    // A credential check that can NEVER call the privileged eraser.
    // Only enabled for the one disposable development account.
    const verifyPath = url.pathname === "/account/reauth-check" || url.pathname === "/account/reauth-check/";
    if (!profilePath && !deletePath && !verifyPath) {
      return json(request, { error: "Not found" }, 404);
    }
    // Strictly separate development-only destructive operations from profiles.
    // The endpoint is absent in production, even if an env flag is mis-set.
    if (deletePath &&
        (process.env.NEON_BRANCH !== "dev/private-member-accounts" ||
         process.env.OGC_ACCOUNT_DELETION_ENABLED !== "true" ||
         !deletionPool)) {
      return json(request, { error: "Not found" }, 404);
    }
    if (verifyPath &&
        (process.env.NEON_BRANCH !== "dev/private-member-accounts" ||
         process.env.OGC_REAUTH_TEST_ENABLED !== "true" ||
         process.env.OGC_REAUTH_TEST_USER_ID !==
           "5b03f41b-29b7-4a7a-9c72-71744dd8b2f2")) {
      return json(request, { error: "Not found" }, 404);
    }
    if (deletePath || verifyPath ? request.method !== "POST" :
        request.method !== "GET" && request.method !== "PUT") {
      return json(request, { error: "Method not allowed" }, 405);
    }

    const userId = await authenticatedUserId(request);
    if (!userId) return json(request, { error: "Unauthorized" }, 401);

    try {
      if (deletePath || verifyPath) {
        if (verifyPath && userId !== process.env.OGC_REAUTH_TEST_USER_ID) {
          return json(request, { error: "Not found" }, 404);
        }
        // The bearer JWT establishes who the member is. The password is
        // independently reverified *server-side* with managed Neon Auth.
        // Neither the browser-supplied email nor any user ID can pick a
        // different account for the privileged database deletion.
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return json(request, { error: "Expected JSON" }, 415);
        }
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 4096) {
          return json(request, { error: "Request too large" }, 413);
        }
        let body: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json(request, { error: "Invalid request" }, 400);
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return json(request, { error: "Invalid JSON" }, 400);
        }
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (body.confirm !== (verifyPath ? "VERIFY" : "DELETE") ||
            email.length < 3 || email.length > 256 ||
            password.length < 12 || password.length > 256) {
          return json(request, { error: "Confirmation, account email and current password required" }, 400);
        }

        const attempt = await withMember(userId, client =>
          client.query("SELECT app_private.reserve_member_deletion_attempt() AS permitted"),
        );
        if (attempt.rows[0]?.permitted !== true) {
          return json(request, { error: "Too many deletion attempts. Try again later." }, 429);
        }

        // Better Auth verifies the submitted password. We accept success
        // ONLY when the server-confirmed identity matches the signed JWT sub.
        // Never forward Auth cookies, tokens, passwords, or error details.
        const baseUrl = process.env.NEON_AUTH_BASE_URL!.trim().replace(/\/$/, "");
        // The successful browser sign-in originates at localhost:5173.
        // Use this fixed, known-trusted dev origin for the server-side call,
        // not an Origin supplied by the browser.
        const verification = await fetch(baseUrl + "/sign-in/email", {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "http://localhost:5173",
          },
          body: JSON.stringify({ email, password, rememberMe: false }),
          signal: AbortSignal.timeout(12000),
        });
        // Read only the provider's allowlisted, non-secret *error code*.
        // Never log the password, response body, token, email, cookie or user ID.
        const authBody = await verification.json().catch(() => null) as
          { user?: { id?: unknown }, data?: { user?: { id?: unknown } },
            code?: unknown, error?: { code?: unknown } } | null;
        if (!verification.ok) {
          if (verifyPath) {
            const rawCode = typeof authBody?.code === "string" ? authBody.code :
              typeof authBody?.error?.code === "string" ? authBody.error.code : "";
            const allowedCodes = new Set([
              "MISSING_OR_NULL_ORIGIN", "INVALID_ORIGIN", "ORIGIN_NOT_ALLOWED",
              "INVALID_EMAIL_OR_PASSWORD", "INVALID_CREDENTIALS",
              "EMAIL_NOT_VERIFIED", "TOO_MANY_REQUESTS",
            ]);
            return json(request, {
              verified: false,
              stage: "provider-http",
              httpStatus: verification.status,
              providerCode: allowedCodes.has(rawCode) ? rawCode : "OTHER",
            }, 403);
          }
          return json(request, { error: "Identity confirmation failed. Account not deleted." }, 403);
        }
        const confirmedUser = authBody?.user ?? authBody?.data?.user;
        if (typeof confirmedUser?.id !== "string" ||
            confirmedUser.id.toLowerCase() !== userId) {
          if (verifyPath) {
            return json(request, { verified: false, stage: "provider-identity" }, 403);
          }
          return json(request, { error: "Identity confirmation failed. Account not deleted." }, 403);
        }
        if (verifyPath) {
          // This route cannot reach the deletion code below.
          return json(request, { verified: true, deleted: false, stage: "confirmed" });
        }

        const deletion = await withDeletionAuthority(userId, client =>
          client.query("SELECT app_private.erase_current_member_after_reauth() AS deleted"),
        );
        if (deletion.rows[0]?.deleted !== true) {
          return json(request, { error: "Account could not be deleted" }, 409);
        }
        // All user-linked rows, including sessions and member profiles, have
        // ON DELETE CASCADE. This cannot erase already-retained backups.
        return json(request, { deleted: true });
      }

      if (request.method === "GET") {
        const result = await withMember(userId, client =>
          client.query(
            "SELECT user_id, display_name, about_me, created_at, updated_at FROM app_private.member_profiles WHERE user_id = $1::uuid",
            [userId],
          ),
        );
        if (!result.rows.length) return json(request, { profile: null });
        return json(request, { profile: present(result.rows[0]) });
      }

      // PUT is a complete replacement of the editable private fields.
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return json(request, { error: "Expected JSON" }, 415);
      }
      const input = await request.text();
      if (new TextEncoder().encode(input).byteLength > 12000) {
        return json(request, { error: "Request too large" }, 413);
      }
      let body: unknown;
      try { body = JSON.parse(input); } catch { return json(request, { error: "Invalid JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(request, { error: "Invalid profile" }, 400);
      }
      const fields = body as Record<string, unknown>;
      const displayName = typeof fields.displayName === "string" ? fields.displayName.trim() : "";
      const aboutMe = typeof fields.aboutMe === "string" ? fields.aboutMe.trim() : "";
      if (displayName.length < 2 || displayName.length > 60 || aboutMe.length > 5000 || fields.adultConfirmed !== true) {
        return json(request, { error: "Enter a 2–60 character name, a bio no longer than 5000 characters, and confirm you are at least 18" }, 400);
      }

      const result = await withMember(userId, client => client.query(
        `INSERT INTO app_private.member_profiles
           (user_id, display_name, about_me, adult_attested_at)
         VALUES ($1::uuid, $2, $3, now())
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           about_me = EXCLUDED.about_me,
           updated_at = now()
         RETURNING user_id, display_name, about_me, created_at, updated_at`,
        [userId, displayName, aboutMe],
      ));
      return json(request, { profile: present(result.rows[0]) });
    } catch (error) {
      // Do not echo SQL errors, tokens, or personally identifiable information.
      console.error("Private profile request failed", error instanceof Error ? error.name : "unknown");
      return json(request, { error: "Service unavailable" }, 503);
    }
  },
};
