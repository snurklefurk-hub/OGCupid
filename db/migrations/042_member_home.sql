-- Home is an authenticated, first-party activity feed and achievement tracker.
-- No private answer contents, message bodies, or precise locations are copied.
ALTER TABLE app_private.member_onboarding ADD COLUMN signup_radius_miles smallint
  CHECK (signup_radius_miles IN (0,10,25,50,100,250,500));

CREATE TABLE app_private.member_home_progress (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  visited_pages text[] NOT NULL DEFAULT '{}',
  search_clicks smallint NOT NULL DEFAULT 0 CHECK(search_clicks BETWEEN 0 AND 5),
  has_quiver boolean NOT NULL DEFAULT false
);
CREATE TABLE app_private.member_personality_awards (
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  code text NOT NULL CHECK(code IN ('feature-creature','explorer','yapper')),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,code)
);
CREATE TABLE app_private.home_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id uuid REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('profile','essay','persona','award','question','article','admin','award-available')),
  body text NOT NULL DEFAULT '',
  href text NOT NULL DEFAULT '',
  happened_at timestamptz NOT NULL DEFAULT now(),
  CHECK(length(body)<=2000 AND length(href)<=200)
);
CREATE INDEX home_events_recent ON app_private.home_events(happened_at DESC,id DESC);
CREATE INDEX home_events_subject ON app_private.home_events(subject_id,kind,happened_at DESC);
CREATE TABLE app_private.member_home_match_state (
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  reached_at timestamptz,
  PRIMARY KEY(user_id,target_id),
  CHECK(user_id<>target_id)
);
REVOKE ALL ON app_private.member_home_progress,app_private.member_personality_awards,app_private.home_events,app_private.member_home_match_state FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
ALTER TABLE app_private.member_home_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_home_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_personality_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_personality_awards FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.home_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.home_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_home_match_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_home_match_state FORCE ROW LEVEL SECURITY;
GRANT SELECT ON app_private.home_events,app_private.member_personality_awards TO ogcupid_member_api;
GRANT SELECT,INSERT,UPDATE ON app_private.member_home_match_state TO ogcupid_member_api;
CREATE POLICY home_event_member_read ON app_private.home_events FOR SELECT TO ogcupid_member_api
 USING(app_private.current_member_is_active() AND (subject_id IS NULL OR
   (app_private.is_discoverable_member(subject_id) AND NOT app_private.member_pair_blocked(nullif(current_setting('app.current_user_id',true),'')::uuid,subject_id))));
CREATE POLICY home_award_member_read ON app_private.member_personality_awards FOR SELECT TO ogcupid_member_api
 USING(app_private.current_member_is_active() AND (user_id::text=nullif(current_setting('app.current_user_id',true),'') OR
   (app_private.is_discoverable_member(user_id) AND NOT app_private.member_pair_blocked(nullif(current_setting('app.current_user_id',true),'')::uuid,user_id))));
CREATE POLICY home_match_owner ON app_private.member_home_match_state FOR ALL TO ogcupid_member_api
 USING(user_id::text=nullif(current_setting('app.current_user_id',true),''))
 WITH CHECK(user_id::text=nullif(current_setting('app.current_user_id',true),''));

-- Permanent public/member destinations, not one-time registration/recovery
-- routes, aliases, or arbitrarily many profile/conversation URLs.
CREATE FUNCTION app_private.home_explorer_pages() RETURNS text[]
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT ARRAY['/home','/verify','/onboarding','/account','/matches','/quickmatch','/visitors','/messages','/community','/questions','/profile','/photos','/settings','/persona','/ogtrends','/ogtrends/zero','/ogtrends/perfect-profile','/ogtrends/references','/contact','/privacy','/terms','/sitemap','/profiles/me']::text[];
$fn$;
CREATE FUNCTION app_private.home_word_count(value text) RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN coalesce(btrim(value),'')='' THEN 0 ELSE cardinality(regexp_split_to_array(btrim(regexp_replace(value,'[[:space:]]+',' ','g')),' +')) END;
$fn$;
CREATE FUNCTION app_private.home_progress(p_event text DEFAULT NULL,p_path text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
DECLARE actor uuid:=nullif(current_setting('app.current_user_id',true),'')::uuid;
  tracked app_private.member_home_progress%ROWTYPE;
  p app_private.member_profiles%ROWTYPE;
  question_count integer; word_count integer; largest_essay integer; votes integer; messages integer;
  persona text; has_mutual boolean; pages text[]:=app_private.home_explorer_pages();
  award_data jsonb;
BEGIN
  IF actor IS NULL OR NOT app_private.current_member_is_active() THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  IF p_event IS NOT NULL AND NOT (p_event='search' AND p_path IS NULL OR p_event='visit' AND p_path=ANY(pages)) THEN
    RAISE EXCEPTION 'Invalid activity' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.member_home_progress(user_id) VALUES(actor) ON CONFLICT DO NOTHING;
  SELECT * INTO tracked FROM app_private.member_home_progress WHERE user_id=actor FOR UPDATE;
  IF p_event='search' THEN
    IF NOT app_private.is_discoverable_member(actor) THEN RAISE EXCEPTION 'Finish onboarding first' USING ERRCODE='42501'; END IF;
    UPDATE app_private.member_home_progress SET search_clicks=least(5,search_clicks+1) WHERE user_id=actor RETURNING * INTO tracked;
  ELSIF p_event='visit' AND NOT p_path=ANY(tracked.visited_pages) THEN
    UPDATE app_private.member_home_progress SET visited_pages=array_append(visited_pages,p_path) WHERE user_id=actor RETURNING * INTO tracked;
  END IF;
  SELECT * INTO p FROM app_private.member_profiles WHERE user_id=actor;
  SELECT count(*)::integer INTO question_count FROM app_private.member_match_answers WHERE user_id=actor;
  SELECT coalesce(sum(n),0)::integer,coalesce(max(n),0)::integer INTO word_count,largest_essay
    FROM unnest(ARRAY[p.about_me,p.life_direction,p.good_at,p.first_things,p.favorites,p.six_things,p.thinking_about,p.friday_night,p.private_thing,p.message_me_if]) AS e(value)
    CROSS JOIN LATERAL (SELECT app_private.home_word_count(e.value) AS n) w;
  SELECT count(*)::integer INTO votes FROM app_private.member_quickmatch_decisions WHERE user_id=actor AND decision IN ('like','dislike');
  SELECT count(*)::integer INTO messages FROM app_private.community_messages WHERE sender_id=actor AND hidden_at IS NULL;
  SELECT persona_code::text INTO persona FROM app_private.member_onboarding WHERE user_id=actor;
  SELECT EXISTS(SELECT 1 FROM app_private.member_quickmatch_decisions mine
    JOIN app_private.member_quickmatch_decisions theirs ON theirs.user_id=mine.target_user_id AND theirs.target_user_id=actor AND theirs.decision='like'
    WHERE mine.user_id=actor AND mine.decision='like' AND app_private.quickmatch_pair_permitted(actor,mine.target_user_id)
    AND NOT app_private.member_pair_blocked(actor,mine.target_user_id)) INTO has_mutual;
  IF has_mutual AND NOT tracked.has_quiver THEN
    UPDATE app_private.member_home_progress SET has_quiver=true WHERE user_id=actor RETURNING * INTO tracked;
  END IF;
  IF app_private.is_discoverable_member(actor) THEN
    IF persona IS NOT NULL AND question_count>=200 AND word_count>=1000 AND votes>=20 AND tracked.has_quiver
      AND '/community'=ANY(tracked.visited_pages) AND messages>=8 AND tracked.search_clicks>=5 THEN
      INSERT INTO app_private.member_personality_awards(user_id,code) VALUES(actor,'feature-creature') ON CONFLICT DO NOTHING;
    END IF;
    IF tracked.visited_pages @> pages THEN
      INSERT INTO app_private.member_personality_awards(user_id,code) VALUES(actor,'explorer') ON CONFLICT DO NOTHING;
    END IF;
    IF largest_essay>500 OR word_count>2000 THEN
      INSERT INTO app_private.member_personality_awards(user_id,code) VALUES(actor,'yapper') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'awardedAt',awarded_at) ORDER BY awarded_at,code),'[]'::jsonb)
    INTO award_data FROM app_private.member_personality_awards WHERE user_id=actor;
  RETURN jsonb_build_object('persona',persona,'questions',question_count,'essayWords',word_count,'largestEssayWords',largest_essay,
    'quickmatchVotes',votes,'hasQuiver',tracked.has_quiver,'communityVisited','/community'=ANY(tracked.visited_pages),
    'communityMessages',messages,'searchClicks',tracked.search_clicks,'pagesVisited',cardinality(tracked.visited_pages),
    'pageTotal',cardinality(pages),'awards',award_data);
END;
$fn$;
CREATE FUNCTION app_private.home_admin_post(p_body text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
DECLARE posts jsonb;
BEGIN
 IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_body IS NOT NULL THEN
   IF length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid post' USING ERRCODE='22023'; END IF;
   INSERT INTO app_private.home_events(kind,body) VALUES('admin',btrim(p_body));
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'createdAt',happened_at) ORDER BY happened_at DESC,id DESC),'[]'::jsonb)
 INTO posts FROM (SELECT id,body,happened_at FROM app_private.home_events WHERE kind='admin' ORDER BY happened_at DESC,id DESC LIMIT 200) recent;
 RETURN posts;
END;
$fn$;

-- Record only public-facing milestones. Draft activity remains invisible
-- to peers until discovery eligibility. No question/essay text is copied.
CREATE FUNCTION app_private.home_onboarding_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
BEGIN
 IF NEW.explored_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.explored_at IS NULL) THEN
   INSERT INTO app_private.home_events(subject_id,kind,happened_at) VALUES(NEW.user_id,'profile',NEW.explored_at);
 END IF;
 IF NEW.persona_code IS NOT NULL AND (TG_OP='INSERT' OR NEW.persona_code IS DISTINCT FROM OLD.persona_code) THEN
   INSERT INTO app_private.home_events(subject_id,kind) VALUES(NEW.user_id,'persona');
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER home_onboarding_event AFTER INSERT OR UPDATE ON app_private.member_onboarding
 FOR EACH ROW EXECUTE FUNCTION app_private.home_onboarding_event();
CREATE FUNCTION app_private.home_essay_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
BEGIN
 IF ROW(NEW.about_me,NEW.life_direction,NEW.good_at,NEW.first_things,NEW.favorites,NEW.six_things,NEW.thinking_about,NEW.friday_night,NEW.private_thing,NEW.message_me_if)
 IS DISTINCT FROM ROW(OLD.about_me,OLD.life_direction,OLD.good_at,OLD.first_things,OLD.favorites,OLD.six_things,OLD.thinking_about,OLD.friday_night,OLD.private_thing,OLD.message_me_if) THEN
   INSERT INTO app_private.home_events(subject_id,kind) VALUES(NEW.user_id,'essay');
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER home_essay_event AFTER UPDATE ON app_private.member_profiles FOR EACH ROW EXECUTE FUNCTION app_private.home_essay_event();
CREATE FUNCTION app_private.home_award_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
BEGIN
 INSERT INTO app_private.home_events(subject_id,kind,body,happened_at) VALUES(NEW.user_id,'award',NEW.code,NEW.awarded_at);
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER home_award_event AFTER INSERT ON app_private.member_personality_awards FOR EACH ROW EXECUTE FUNCTION app_private.home_award_event();
CREATE FUNCTION app_private.home_question_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app_private AS $fn$
BEGIN
 INSERT INTO app_private.home_events(kind,body,href) VALUES('question','A new match question has been added to the bank.','/questions');
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER home_question_event AFTER INSERT ON app_private.published_match_questions FOR EACH ROW EXECUTE FUNCTION app_private.home_question_event();

-- Backfill only real profile-publication timestamps, not fabricated edit/quiz times.
INSERT INTO app_private.home_events(subject_id,kind,happened_at)
 SELECT user_id,'profile',explored_at FROM app_private.member_onboarding WHERE explored_at IS NOT NULL;
INSERT INTO app_private.home_events(kind,body,href,happened_at) VALUES
 ('article','OgTrends #0: The Big Idea','/ogtrends/zero','2026-11-15T00:00:00Z'),
 ('article','The Perfect Dating Profile: Why Everything We Know Might Be Wrong','/ogtrends/perfect-profile','2026-11-05T00:00:00Z'),
 ('article','Your Ex Has Entered the Chat: Can Dating References Make Profiles More Honest?','/ogtrends/references','2026-11-05T00:00:00Z');
INSERT INTO app_private.home_events(kind,body,href) VALUES
 ('award-available','Feature Creature — take the Persona Test and complete every What to do activity.','/home?tab=todo'),
 ('award-available','explorer — visit every permanent, non-admin site page.','/sitemap'),
 ('award-available','yapper — write an essay over 500 words or a profile over 2000 essay words.','/profile');
REVOKE ALL ON FUNCTION app_private.home_explorer_pages(),app_private.home_word_count(text),app_private.home_progress(text,text),app_private.home_admin_post(text),
 app_private.home_onboarding_event(),app_private.home_essay_event(),app_private.home_award_event(),app_private.home_question_event() FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.home_progress(text,text),app_private.home_admin_post(text) TO ogcupid_member_api;
