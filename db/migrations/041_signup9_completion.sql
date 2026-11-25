-- Signup9 tutorial completion marker, separate from the existing discovery gate.
ALTER TABLE app_private.member_onboarding ADD COLUMN signup9_completed_at timestamptz;
-- A pre-essay profile is needed for the existing photo FK. Keep unfinished
-- profiles/photos out of peer reads; owners retain access and existing
-- authenticated/discoverable members retain normal peer access.
DROP POLICY member_profiles_authenticated_read ON app_private.member_profiles;
CREATE POLICY member_profiles_authenticated_read ON app_private.member_profiles FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active() AND app_private.is_discoverable_member(user_id));
DROP POLICY member_photo_authenticated_peer_read ON app_private.member_photos;
CREATE POLICY member_photo_authenticated_peer_read ON app_private.member_photos FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active() AND app_private.is_discoverable_member(user_id));
DROP POLICY profile_routes_member_read ON app_private.member_profile_routes;
CREATE POLICY profile_routes_member_read ON app_private.member_profile_routes FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active() AND (user_id::text=nullif(current_setting('app.current_user_id',true),'') OR app_private.is_discoverable_member(user_id)));
