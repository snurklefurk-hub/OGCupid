-- Authenticated member-to-member profile photo reads.
-- The JWT/liveness-verified Neon Function serves actual JPEG bytes; the
-- private object bucket remains inaccessible directly to browsers or guests.
-- This additive SELECT policy does not expand owner-only write permissions.
CREATE POLICY member_photo_authenticated_peer_read
ON app_private.member_photos FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active());
