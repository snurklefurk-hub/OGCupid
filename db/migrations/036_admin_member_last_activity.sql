-- 036: Show the existing member heartbeat timestamp in admin-only member lists.
-- No new tracking, backfill, public API grant or member-data mutation.
CREATE OR REPLACE FUNCTION app_private.admin_members(p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app_private'
AS $function$
DECLARE q text := left(btrim(coalesce(p_search,'')),80); result jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',u.name,'email',u.email,'role',coalesce(u.role,'user'),
    'verified',u."emailVerified",'createdAt',u."createdAt",
    'profile',p.display_name,'slug',r.slug,
    'onboarded',o.explored_at IS NOT NULL,
    'banned',coalesce(u.banned,false),
    'banReason',u."banReason",'banExpires',u."banExpires",
    'lastActivityAt',activity.last_seen_at)
    ORDER BY u."createdAt" DESC,u.id),'[]'::jsonb)
  INTO result
  FROM (SELECT * FROM neon_auth."user" a
        WHERE q='' OR position(lower(q) IN lower(a.email)) > 0
          OR position(lower(q) IN lower(a.name)) > 0
        ORDER BY a."createdAt" DESC LIMIT 100) u
  LEFT JOIN app_private.member_profiles p ON p.user_id=u.id
  LEFT JOIN app_private.member_profile_routes r ON r.user_id=u.id
  LEFT JOIN app_private.member_onboarding o ON o.user_id=u.id
  LEFT JOIN app_private.member_activity activity ON activity.user_id=u.id;
  RETURN result;
END; $function$

