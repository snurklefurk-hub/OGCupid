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

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL!).origin;
const allowedOrigins = new Set([
  "https://ogcupid.com",
  "https://www.ogcupid.com",
  "https://ogcupid.onrender.com",
]);

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
    h.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
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
    if (url.pathname !== "/profile" && url.pathname !== "/profile/") {
      return json(request, { error: "Not found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "PUT") {
      return json(request, { error: "Method not allowed" }, 405);
    }

    const userId = await authenticatedUserId(request);
    if (!userId) return json(request, { error: "Unauthorized" }, 401);

    try {
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
