-- OG Cupid private member profile foundation.
-- This file is safe to version-control. It contains no secrets or real member data.
-- Apply to a Neon DEVELOPMENT branch first; do not auto-apply to production.
-- Neon Auth stores accounts in neon_auth."user".

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_private.member_profiles (
    user_id UUID PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    about_me TEXT NOT NULL DEFAULT '',
    adult_attested_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT member_display_name_length
      CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 60),
    CONSTRAINT member_about_me_length
      CHECK (char_length(about_me) <= 5000)
);

REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private REVOKE ALL ON TABLES FROM PUBLIC;

-- Defense-in-depth: even the table owner must satisfy RLS.
-- The authenticated Neon Function sets app.current_user_id with SET LOCAL
-- inside the same database transaction as each member-data operation.
ALTER TABLE app_private.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY member_profiles_owner_only
ON app_private.member_profiles
FOR ALL
USING (
  user_id::TEXT = NULLIF(current_setting('app.current_user_id', true), '')
)
WITH CHECK (
  user_id::TEXT = NULLIF(current_setting('app.current_user_id', true), '')
);

COMMENT ON TABLE app_private.member_profiles IS
  'Private-by-default profiles: no public browsing or guest access. Access only after verified auth and transaction-scoped user ID.';
