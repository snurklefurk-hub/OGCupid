-- Lock down the route table despite older schema-wide default grants.
-- No profile row or mapping is deleted or changed.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON app_private.member_profile_routes FROM ogcupid_member_api;
GRANT SELECT ON app_private.member_profile_routes TO ogcupid_member_api;
ALTER TABLE app_private.member_profile_routes FORCE ROW LEVEL SECURITY;
