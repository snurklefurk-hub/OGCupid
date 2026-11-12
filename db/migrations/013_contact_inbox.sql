-- 013: Public contact form inbox. Authenticated member data remains private.
-- Messages are accepted only through the guarded POST /contact API route.
-- This is not email delivery: an operator reads the restricted database inbox.
-- Don't store raw IPs, passwords, or credentials in messages.

CREATE TABLE IF NOT EXISTS app_private.contact_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('general','account','privacy','safety','copyright')),
  sender_name text NOT NULL DEFAULT '' CHECK (char_length(sender_name) <= 80),
  sender_email text NOT NULL CHECK (char_length(sender_email) BETWEEN 3 AND 254),
  body text NOT NULL CHECK (char_length(body) BETWEEN 15 AND 3000),
  rate_key text NOT NULL CHECK (rate_key ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','reviewing','resolved'))
);

CREATE INDEX IF NOT EXISTS contact_messages_rate_limit_idx
  ON app_private.contact_messages(rate_key, submitted_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_inbox_idx
  ON app_private.contact_messages(submitted_at DESC);

ALTER TABLE app_private.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.contact_messages FORCE ROW LEVEL SECURITY;

-- Only the owner/definer may touch the private table; no client-side SQL access.
CREATE POLICY contact_messages_owner_operator
  ON app_private.contact_messages FOR ALL TO neondb_owner
  USING (true) WITH CHECK (true);

REVOKE ALL ON app_private.contact_messages
  FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

REVOKE ALL ON SEQUENCE app_private.contact_messages_id_seq
  FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

CREATE OR REPLACE FUNCTION app_private.submit_contact_message(
  p_category text, p_name text, p_email text, p_body text, p_rate_key text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $contact$
BEGIN
  IF p_category NOT IN ('general','account','privacy','safety','copyright') OR
     p_name IS NULL OR char_length(p_name) > 80 OR
     p_email IS NULL OR char_length(p_email) NOT BETWEEN 3 AND 254 OR
     p_body IS NULL OR char_length(p_body) NOT BETWEEN 15 AND 3000 OR
     p_rate_key IS NULL OR p_rate_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid contact request' USING ERRCODE = '22023';
  END IF;

  -- Serialize contact admissions to enforce shared abuse budgets consistently.
  PERFORM pg_advisory_xact_lock(341, 42);
  IF (SELECT count(*) FROM app_private.contact_messages
      WHERE rate_key = p_rate_key AND submitted_at > now() - interval '1 hour') >= 3
    OR (SELECT count(*) FROM app_private.contact_messages
      WHERE rate_key = p_rate_key AND submitted_at > now() - interval '24 hours') >= 10
    OR (SELECT count(*) FROM app_private.contact_messages
      WHERE submitted_at > now() - interval '24 hours') >= 1200 THEN
    RAISE EXCEPTION 'Contact message limit reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app_private.contact_messages(category, sender_name, sender_email, body, rate_key)
  VALUES (p_category, p_name, p_email, p_body, p_rate_key);
  RETURN true;
END;
$contact$;

REVOKE ALL ON FUNCTION app_private.submit_contact_message(text,text,text,text,text)
  FROM PUBLIC, ogcupid_delete_api;

GRANT EXECUTE ON FUNCTION app_private.submit_contact_message(text,text,text,text,text)
  TO ogcupid_member_api;

COMMENT ON TABLE app_private.contact_messages IS
  'Private operator-only contact inbox. Sender fields and keyed network hash. No email notification yet. No public or member read access.';

COMMENT ON FUNCTION app_private.submit_contact_message(text,text,text,text,text) IS
  'Rate-limited public form intake called solely by the server after origin, honeypot and payload validation.';
