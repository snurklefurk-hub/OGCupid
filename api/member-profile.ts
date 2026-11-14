// Private member profile API for Neon Functions (Node.js 24).
// No database URL, token, or user data is embedded in this file.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { isPhotoPath, photoMethodAllowed, handlePhotoRequest } from "./member-photos.js";
import { removePhoto } from "./photo-storage.js";
import { isKrustyKrabCookJob } from "./job-moderation.js";
import { validProfileChoice } from "./profile-choices.js";
import { handleOnboarding } from "./onboarding.js";
import { handleFeedback } from "./member-feedback.js";

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
if (["dev/private-member-accounts","dev/canonical-onboarding-2026-11-13"].includes(process.env.NEON_BRANCH || "")) {
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
    h.set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
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


type CanonicalPlace = {
  id: number;
  key: string;
  label: string;
  lat: number;
  lon: number;
};

type GeoRow = Record<string, unknown> | null;

function geoDetails(row: GeoRow) {
  return {
    localityId: row?.locality_id == null ? null : Number(row.locality_id),
    localityKey: String(row?.locality_shard ?? ""),
    searchOriginId: row?.search_origin_id == null ? null : Number(row.search_origin_id),
    searchOriginKey: String(row?.search_origin_shard ?? ""),
    searchOriginLabel: String(row?.search_origin_label ?? ""),
    searchRadiusMiles: row?.search_radius_miles == null ? null : Number(row.search_radius_miles),
  };
}

// GeoNames city data is hosted as public static reference data on OG Cupid.
// The server, not the browser, resolves coordinates and labels from the
// canonical ID. A member cannot insert arbitrary precise GPS coordinates.
const placeShardCache = new Map<string, Array<Record<string, unknown>>>();
async function verifiedPlace(raw: unknown): Promise<CanonicalPlace | null> {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid location");
  const ref = raw as Record<string, unknown>;
  if (Object.keys(ref).sort().join(",") !== "id,key" ||
      !Number.isSafeInteger(ref.id) || Number(ref.id) <= 0 || Number(ref.id) > 999999999 ||
      typeof ref.key !== "string" || !/^[a-z0-9_]{2}$/.test(ref.key)) {
    throw new Error("Invalid location");
  }
  let places = placeShardCache.get(ref.key);
  if (!places) {
    const url = "https://ogcupid.onrender.com/locations/" + ref.key + ".json";
    let response: Response;
    try {
      response = await fetch(url, { cache: "force-cache", redirect: "error", signal: AbortSignal.timeout(6000) });
    } catch { throw new Error("Location index unavailable"); }
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json") ||
        Number(response.headers.get("content-length") ?? 0) > 4000000) {
      throw new Error("Location index unavailable");
    }
    const data: unknown = await response.json().catch(() => null);
    if (!Array.isArray(data) || data.length > 50000) throw new Error("Location index unavailable");
    places = data as Array<Record<string, unknown>>;
    if (placeShardCache.size > 32) placeShardCache.delete(placeShardCache.keys().next().value ?? "");
    placeShardCache.set(ref.key, places);
  }
  const place = places.find(entry => entry.id === ref.id);
  if (!place || typeof place.n !== "string" || !place.n.trim() ||
      typeof place.a !== "string" || typeof place.c !== "string" ||
      !/^[A-Z]{2}$/.test(place.c) ||
      typeof place.x !== "number" || typeof place.y !== "number" ||
      !Number.isFinite(place.x) || !Number.isFinite(place.y) ||
      Math.abs(place.x) > 90 || Math.abs(place.y) > 180) {
    throw new Error("Invalid location");
  }
  const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(place.c) || place.c;
  const name = place.n.trim();
  const region = place.a.trim();
  const label = [name, region && region.toLowerCase() !== name.toLowerCase() ? region : "", countryName]
    .filter(Boolean).join(", ");
  if (label.length > 100) throw new Error("Invalid location");
  return { id: Number(ref.id), key: ref.key, label, lat: place.x, lon: place.y };
}

type MemberProfile = {
  userId: string;
  displayName: string;
  aboutMe: string;
  age: number | null;
  cityRegion: string;
  gender: string;
  pronouns: string;
  orientation: string;
  interestedIn: string;
  relationshipGoal: string;
  lookingFor: string;
  work: string;
  education: string;
  height: string;
  kids: string;
  pets: string;
  smoking: string;
  drinking: string;
  diet: string;
  languages: string;
  lifeDirection: string;
  goodAt: string;
  favorites: string;
  sixThings: string;
  fridayNight: string;
  messageMeIf: string;
  ethnicity: string; bodyType: string; vaping: string; drugs: string;
  religion: string; sign: string; income: string; status: string; relationshipType: string;
  createdAt: string;
  updatedAt: string;
};

function present(row: Record<string, unknown>): MemberProfile {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    aboutMe: String(row.about_me),
    age: row.age == null ? null : Number(row.age),
    cityRegion: String(row.city_region ?? ""),
    gender: String(row.gender ?? ""),
    pronouns: String(row.pronouns ?? ""),
    orientation: String(row.orientation ?? ""),
    interestedIn: String(row.interested_in ?? ""),
    relationshipGoal: String(row.relationship_goal ?? ""),
    lookingFor: String(row.looking_for ?? ""),
    work: String(row.work ?? ""),
    education: String(row.education ?? ""),
    height: String(row.height ?? ""),
    kids: String(row.kids ?? ""),
    pets: String(row.pets ?? ""),
    smoking: String(row.smoking ?? ""),
    drinking: String(row.drinking ?? ""),
    diet: String(row.diet ?? ""),
    languages: String(row.languages ?? ""),
    lifeDirection: String(row.life_direction ?? ""),
    goodAt: String(row.good_at ?? ""),
    favorites: String(row.favorites ?? ""),
    sixThings: String(row.six_things ?? ""),
    fridayNight: String(row.friday_night ?? ""),
    messageMeIf: String(row.message_me_if ?? ""),
    ethnicity: String(row.ethnicity ?? ""), bodyType: String(row.body_type ?? ""),
    vaping: String(row.vaping ?? ""), drugs: String(row.drugs ?? ""),
    religion: String(row.religion ?? ""), sign: String(row.sign ?? ""),
    income: String(row.income ?? ""), status: String(row.status ?? ""),
    relationshipType: String(row.relationship_type ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}


/** Explicit server-owned field schema, shared by validation and SQL assembly.
 * Never build SQL column names from incoming JSON keys. */
const profileTextFields = [
  ["cityRegion", "city_region", 100],
  ["gender", "gender", 60],
  ["pronouns", "pronouns", 40],
  ["orientation", "orientation", 60],
  ["interestedIn", "interested_in", 120],
  ["relationshipGoal", "relationship_goal", 100],
  ["work", "work", 160],
  ["education", "education", 120],
  ["height", "height", 50],
  ["kids", "kids", 80],
  ["pets", "pets", 80],
  ["smoking", "smoking", 60],
  ["drinking", "drinking", 60],
  ["diet", "diet", 100],
  ["languages", "languages", 160],
  ["ethnicity", "ethnicity", 200],
  ["bodyType", "body_type", 30],
  ["vaping", "vaping", 30],
  ["drugs", "drugs", 30],
  ["religion", "religion", 160],
  ["sign", "sign", 100],
  ["income", "income", 30],
  ["status", "status", 30],
  ["relationshipType", "relationship_type", 50],
  ["lifeDirection", "life_direction", 2000],
  ["goodAt", "good_at", 1500],
  ["favorites", "favorites", 2000],
  ["sixThings", "six_things", 1500],
  ["fridayNight", "friday_night", 1500],
  ["messageMeIf", "message_me_if", 1500],
] as const;

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
    const answersPath = url.pathname === "/answers" || url.pathname === "/answers/";
    const photoPath = isPhotoPath(url.pathname);
    const onboardingPath = url.pathname === "/onboarding" || url.pathname === "/onboarding/";
    const feedbackPath = url.pathname === "/feedback" || url.pathname === "/feedback/";
    const emailPreferencesPath = url.pathname === "/email-preferences" || url.pathname === "/email-preferences/";
    const deletePath = url.pathname === "/account/delete" || url.pathname === "/account/delete/";
    // A credential check that can NEVER call the privileged eraser.
    // Only enabled for the one disposable development account.
    const verifyPath = url.pathname === "/account/reauth-check" || url.pathname === "/account/reauth-check/";
    if (!profilePath && !answersPath && !emailPreferencesPath && !deletePath && !verifyPath && !photoPath && !onboardingPath && !feedbackPath) {
      return json(request, { error: "Not found" }, 404);
    }
    // Self-service deletion is allowed only on the explicitly configured
    // development or production branch, and only with its dedicated
    // server-side deletion credential and deliberate feature flag.
    const productionBranch = process.env.NEON_BRANCH === "production";
    const developmentBranch = process.env.NEON_BRANCH === "dev/private-member-accounts" ||
      process.env.NEON_BRANCH === "dev/canonical-onboarding-2026-11-13";
    if (deletePath &&
        (!(productionBranch || developmentBranch) ||
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
    const methodAllowed = feedbackPath ? request.method === "POST" : photoPath
      ? photoMethodAllowed(url.pathname, request.method)
      : deletePath || verifyPath
        ? request.method === "POST"
        : request.method === "GET" || request.method === "PUT";
    if (!methodAllowed) {
      return json(request, { error: "Method not allowed" }, 405);
    }

    const userId = await authenticatedUserId(request);
    if (!userId) return json(request, { error: "Unauthorized" }, 401);

    try {
      if (profilePath || answersPath || emailPreferencesPath || photoPath || onboardingPath || feedbackPath) {
        // A signed JWT can outlive the account/session that issued it.
        // Do not allow a deleted identity to read an empty profile as if it
        // were still a member, or attempt to recreate a profile via PUT.
        // The restricted profile role cannot SELECT Neon Auth's user table,
        // so use a no-argument SECURITY DEFINER liveness check instead.
        const liveness = await withMember(userId, client =>
          client.query("SELECT app_private.current_member_is_active() AS active"),
        );
        if (liveness.rows[0]?.active !== true) {
          return json(request, { error: "Account no longer active" }, 401);
        }
      }

      if (feedbackPath) {
        return await handleFeedback(request,userId,withMember,json);
      }
      if (photoPath) {
        return await handlePhotoRequest(request,userId,url,withMember,json);
      }
      if (onboardingPath) {
        return await handleOnboarding(request,userId,withMember,json,verifiedPlace);
      }

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
        // Verify against Neon Auth using a fixed, trusted origin belonging
        // to this branch. Do not forward a browser-controlled Origin.
        const trustedReauthOrigin = productionBranch
          ? "https://ogcupid.onrender.com"
          : "http://localhost:5173";
        const verification = await fetch(baseUrl + "/sign-in/email", {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": trustedReauthOrigin,
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

        // On account deletion, also remove private S3 pictures before
        // cascading the user's DB rows. Failure aborts deletion rather than
        // silently retaining those uploaded photo objects indefinitely.
        try {
          const photoRows = await withMember(userId, client => client.query(
            "SELECT object_key FROM app_private.member_photos WHERE user_id=$1::uuid",
            [userId],
          ));
          for (const row of photoRows.rows) await removePhoto(row.object_key);
        } catch {
          return json(request, { error: "Could not remove account photos. Account not deleted; try again." }, 503);
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

      if (emailPreferencesPath) {
        // Optional email choices are stored separately from the profile
        // and accessible only through a live authenticated owner's RLS.
        if (request.method === "GET") {
          const result = await withMember(userId, client => client.query(
            `SELECT unread_messages, unseen_activity, site_updates, necessary_only, updated_at
             FROM app_private.member_email_preferences WHERE user_id = $1::uuid`,
            [userId],
          ));
          const row = result.rows[0];
          return json(request, { preferences: row ? {
            unreadMessages: row.unread_messages === true,
            unseenActivity: row.unseen_activity === true,
            siteUpdates: row.site_updates === true,
            necessaryOnly: row.necessary_only === true,
            updatedAt: row.updated_at,
          } : {
            unreadMessages: false,
            unseenActivity: false,
            siteUpdates: false,
            necessaryOnly: true,
            updatedAt: null,
          } });
        }
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return json(request, { error: "Expected JSON" }, 415);
        }
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 2048) {
          return json(request, { error: "Request too large" }, 413);
        }
        let fields: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json(request, { error: "Invalid email preferences" }, 400);
          }
          fields = parsed as Record<string, unknown>;
        } catch {
          return json(request, { error: "Invalid JSON" }, 400);
        }
        const expected = ["unreadMessages", "unseenActivity", "siteUpdates", "necessaryOnly"];
        if (Object.keys(fields).length !== expected.length ||
            !expected.every(key => typeof fields[key] === "boolean")) {
          return json(request, { error: "Choose valid email preferences" }, 400);
        }
        // Necessary-only overrides every optional category. With none
        // selected we automatically fall back to necessary-only.
        const necessaryOnly = fields.necessaryOnly === true ||
          !(fields.unreadMessages || fields.unseenActivity || fields.siteUpdates);
        const unreadMessages = !necessaryOnly && fields.unreadMessages === true;
        const unseenActivity = !necessaryOnly && fields.unseenActivity === true;
        const siteUpdates = !necessaryOnly && fields.siteUpdates === true;
        const saved = await withMember(userId, client => client.query(
          `INSERT INTO app_private.member_email_preferences
             (user_id, unread_messages, unseen_activity, site_updates, necessary_only)
           VALUES ($1::uuid,$2,$3,$4,$5)
           ON CONFLICT (user_id) DO UPDATE SET
             unread_messages = EXCLUDED.unread_messages,
             unseen_activity = EXCLUDED.unseen_activity,
             site_updates = EXCLUDED.site_updates,
             necessary_only = EXCLUDED.necessary_only,
             updated_at = now()
           RETURNING updated_at`,
          [userId, unreadMessages, unseenActivity, siteUpdates, necessaryOnly],
        ));
        return json(request, { saved: true, preferences: {
          unreadMessages, unseenActivity, siteUpdates, necessaryOnly,
          updatedAt: saved.rows[0].updated_at,
        } });
      }

      if (answersPath) {
        if (request.method === "GET") {
          const result = await withMember(userId, client => client.query(
            `SELECT question_id, option_id, acceptable_options, importance, is_private, note, updated_at
             FROM app_private.member_match_answers WHERE user_id = $1::uuid ORDER BY question_id`, [userId],
          ));
          return json(request, { answers: result.rows.map(row => ({
            questionId: row.question_id, optionId: row.option_id,
            acceptableOptions: row.acceptable_options, importance: row.importance,
            isPrivate: row.is_private, note: row.note, updatedAt: row.updated_at,
          })) });
        }
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return json(request, { error: "Expected JSON" }, 415);
        }
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 4096) return json(request, { error: "Request too large" }, 413);
        let answer: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid answer");
          answer = parsed as Record<string, unknown>;
        } catch { return json(request, { error: "Invalid JSON" }, 400); }
        const questionId = answer.questionId;
        const optionId = answer.optionId;
        const acceptable = answer.acceptableOptions;
        const note = answer.note ?? "";
        if (typeof questionId !== "string" || !/^vault-[0-9]{1,25}$/.test(questionId) ||
            typeof optionId !== "string" || !/^option-[0-9]{1,20}$/.test(optionId) ||
            !Array.isArray(acceptable) || acceptable.length > 20 ||
            !acceptable.every(value => typeof value === "string" && /^option-[0-9]{1,20}$/.test(value)) ||
            ![0, 1, 10, 50, 250].includes(answer.importance as number) ||
            typeof answer.isPrivate !== "boolean" || typeof note !== "string" || note.length > 400) {
          return json(request, { error: "Invalid answer" }, 400);
        }
        const result = await withMember(userId, async client => {
          const published = await client.query(
            "SELECT option_ids FROM app_private.published_match_questions WHERE question_id = $1", [questionId],
          );
          const ids: string[] = published.rows[0]?.option_ids ?? [];
          if (!ids.includes(optionId) || !acceptable.every(value => ids.includes(value))) return null;
          return client.query(
          `INSERT INTO app_private.member_match_answers
             (user_id, question_id, option_id, acceptable_options, importance, is_private, note)
           VALUES ($1::uuid, $2, $3, $4::text[], $5, $6, $7)
           ON CONFLICT (user_id, question_id) DO UPDATE SET
             option_id = EXCLUDED.option_id, acceptable_options = EXCLUDED.acceptable_options,
             importance = EXCLUDED.importance, is_private = EXCLUDED.is_private,
             note = EXCLUDED.note, updated_at = now()
           RETURNING updated_at`,
          [userId, questionId, optionId, acceptable, answer.importance, answer.isPrivate, note],
          );
        });
        if (!result) return json(request, { error: "Question or choice is not in the published set" }, 400);
        return json(request, { saved: true, updatedAt: result.rows[0].updated_at });
      }

      if (request.method === "GET") {
        const result = await withMember(userId, async client => {
          const profile = await client.query(
            `SELECT user_id, display_name, about_me, age, city_region, gender, pronouns, orientation, interested_in, relationship_goal, work, education, height, kids, pets, smoking, drinking, diet, languages, ethnicity, body_type, vaping, drugs, religion, sign, income, status, relationship_type, life_direction, good_at, favorites, six_things, friday_night, message_me_if, created_at, updated_at FROM app_private.member_profiles WHERE user_id = $1::uuid`,
            [userId],
          );
          const geo = await client.query(
            "SELECT locality_id, locality_shard, search_origin_id, search_origin_shard, search_origin_label, search_radius_miles FROM app_private.member_localities WHERE user_id = $1::uuid",
            [userId],
          );
          // This uses the transaction-local authenticated member identity.
          // The founder award table itself has no direct member-role grants.
          const founder = await client.query(
            "SELECT app_private.current_member_founder_status() AS status",
          );
          return {
            profile: profile.rows[0] ?? null,
            geo: geo.rows[0] ?? null,
            founderStatus: founder.rows[0]?.status ?? null,
          };
        });
        if (!result.profile) return json(request, { profile: null });
        return json(request, { profile: {
          ...present(result.profile),
          ...geoDetails(result.geo),
          founderStatus: result.founderStatus,
        } });
      }

      // PUT is a complete replacement of the editable private fields.
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return json(request, { error: "Expected JSON" }, 415);
      }
      const input = await request.text();
      if (new TextEncoder().encode(input).byteLength > 24000) {
        return json(request, { error: "Request too large" }, 413);
      }
      let body: unknown;
      try { body = JSON.parse(input); } catch { return json(request, { error: "Invalid JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(request, { error: "Invalid profile" }, 400);
      }
      const fields = body as Record<string, unknown>;
      const aboutMe = typeof fields.aboutMe === "string" ? fields.aboutMe.trim() : "";
      if (aboutMe.length > 5000) {
        return json(request, { error: "Enter a bio no longer than 5000 characters" }, 400);
      }
      const rawAge = fields.age;
      const age = rawAge == null || rawAge === "" ? null : rawAge;
      if (age !== null && (!Number.isInteger(age) || Number(age) < 18 || Number(age) > 120)) {
        return json(request, { error: "Age must be between 18 and 120, or left blank" }, 400);
      }
      // Older editor versions do not send any geo keys: keep their existing
      // locality preferences untouched when they save ordinary essay fields.
      const geoSupplied = ["locality", "searchOrigin", "searchRadiusMiles"]
        .some(key => Object.prototype.hasOwnProperty.call(fields, key));
      let locality: CanonicalPlace | null = null;
      let searchOrigin: CanonicalPlace | null = null;
      let searchRadiusMiles: number | null = null;
      if (geoSupplied) {
        if (!["locality", "searchOrigin", "searchRadiusMiles"]
          .every(key => Object.prototype.hasOwnProperty.call(fields, key))) {
          return json(request, { error: "Incomplete location preferences" }, 400);
        }
        if (fields.searchRadiusMiles !== null &&
            ![10, 25, 50, 100, 250].includes(fields.searchRadiusMiles as number)) {
          return json(request, { error: "Choose a valid distance" }, 400);
        }
        searchRadiusMiles = fields.searchRadiusMiles as number | null;
        try {
          locality = await verifiedPlace(fields.locality);
          searchOrigin = await verifiedPlace(fields.searchOrigin);
        } catch (error) {
          const unavailable = error instanceof Error && error.message === "Location index unavailable";
          return json(request,
            { error: unavailable ? "Locality index temporarily unavailable" : "Choose a locality from the search results" },
            unavailable ? 503 : 400);
        }
      }
      const extraValues: string[] = [];
      for (const [key, , maxLength] of profileTextFields) {
        const value = key === "cityRegion" && locality ? locality.label : (fields[key] ?? "");
        if (typeof value !== "string" || value.trim().length > maxLength) {
          return json(request, { error: "A profile field exceeds its permitted length" }, 400);
        }
        extraValues.push(value.trim());
      }
      if (isKrustyKrabCookJob(fields.work)) {
        // Safe hold: this endpoint has no production deletion authority. Do
        // not turn a text typo into an irreversible account deletion or scan
        // existing members. A separately reviewed moderation workflow must
        // perform any future ban/blacklist action with audit logging.
        return json(request, { error: "That job entry is banned for being cringe." }, 403);
      }
      // SQL identifiers are always sourced from the constant profileTextFields
      // above. Only values are supplied by the member, via parameters.
      const columns = profileTextFields.map(([, column]) => column);
      // An older cached client omits new fields. Preserve those columns;
      // an explicitly supplied empty string still clears a field.
      const fieldUpdates = profileTextFields
        .filter(([key]) => Object.prototype.hasOwnProperty.call(fields, key))
        .map(([, column]) => `${column} = EXCLUDED.${column}`);
      const paramList = columns.map((_, index) => `$${index + 5}`);
      const allReturned = ["user_id", "display_name", "about_me", "age", ...columns, "created_at", "updated_at"];
      const sql = `INSERT INTO app_private.member_profiles
           (user_id, display_name, about_me, adult_attested_at, age, ${columns.join(", ")})
         VALUES ($1::uuid, $2, $3, now(), $4, ${paramList.join(", ")})
         ON CONFLICT (user_id) DO UPDATE SET
           -- Display name is account identity; profile setup cannot rename it.
           about_me = EXCLUDED.about_me,
           age = EXCLUDED.age,
           ${fieldUpdates.length ? fieldUpdates.join(", ") + "," : ""}
           updated_at = now()
         RETURNING ${allReturned.join(", ")}`;
      const result = await withMember(userId, async client => {
        // The account service, not this browser payload, owns display name.
        // This prevents a profile PUT (including a hand-crafted one) from
        // setting or changing another account attribute.  Existing profile
        // names are retained; a first profile reads the verified Auth name
        // through the narrowly scoped SECURITY DEFINER helper in migration 014.
        const existing = await client.query(
          `SELECT display_name, ${columns.join(", ")} FROM app_private.member_profiles WHERE user_id = $1::uuid`,
          [userId],
        );
        for (const [index, [key, column]] of profileTextFields.entries()) {
          if (!validProfileChoice(key, extraValues[index], existing.rows[0]?.[column])) {
            throw new Error("Invalid controlled profile choice");
          }
        }
        const displayName = existing.rows[0]?.display_name == null
          ? String((await client.query("SELECT app_private.current_member_display_name() AS display_name")).rows[0]?.display_name ?? "").trim()
          : String(existing.rows[0].display_name).trim();
        if (displayName.length < 2 || displayName.length > 60) {
          throw new Error("Account display name is unavailable");
        }
        const saved = await client.query(sql, [userId, displayName, aboutMe, age, ...extraValues]);
        if (geoSupplied) {
          await client.query(
            "INSERT INTO app_private.member_localities " +
            "(user_id, locality_id, locality_shard, locality_lat, locality_lon, " +
            "search_origin_id, search_origin_shard, search_origin_label, search_origin_lat, search_origin_lon, search_radius_miles) " +
            "VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) " +
            "ON CONFLICT (user_id) DO UPDATE SET locality_id=EXCLUDED.locality_id, " +
            "locality_shard=EXCLUDED.locality_shard, locality_lat=EXCLUDED.locality_lat, locality_lon=EXCLUDED.locality_lon, " +
            "search_origin_id=EXCLUDED.search_origin_id, search_origin_shard=EXCLUDED.search_origin_shard, " +
            "search_origin_label=EXCLUDED.search_origin_label, search_origin_lat=EXCLUDED.search_origin_lat, " +
            "search_origin_lon=EXCLUDED.search_origin_lon, search_radius_miles=EXCLUDED.search_radius_miles, updated_at=now()",
            [userId, locality?.id ?? null, locality?.key ?? null, locality?.lat ?? null, locality?.lon ?? null,
             searchOrigin?.id ?? null, searchOrigin?.key ?? null, searchOrigin?.label ?? null,
             searchOrigin?.lat ?? null, searchOrigin?.lon ?? null, searchRadiusMiles],
          );
        }
        const geo = await client.query(
          "SELECT locality_id, locality_shard, search_origin_id, search_origin_shard, search_origin_label, search_radius_miles FROM app_private.member_localities WHERE user_id = $1::uuid",
          [userId],
        );
        const founder = await client.query(
          "SELECT app_private.current_member_founder_status() AS status",
        );
        return {
          profile: saved.rows[0],
          geo: geo.rows[0] ?? null,
          founderStatus: founder.rows[0]?.status ?? null,
        };
      });
      return json(request, { profile: {
        ...present(result.profile),
        ...geoDetails(result.geo),
        founderStatus: result.founderStatus,
      } });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid controlled profile choice") {
        return json(request, { error: "Choose a valid profile option" }, 400);
      }
      // Do not echo SQL errors, tokens, or personally identifiable information.
      console.error("Private profile request failed", error instanceof Error ? error.name : "unknown");
      return json(request, { error: "Service unavailable" }, 503);
    }
  },
};

