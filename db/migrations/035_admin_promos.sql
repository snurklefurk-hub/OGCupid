-- 035: persistent admin-managed outer-column promotion cards.
-- Seed the 20 approved editorial cards and 5 profile-refinement cards exactly
-- once; future admin changes are not reset by redeploying this migration.
CREATE TABLE IF NOT EXISTS app_private.promo_cards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_key text UNIQUE,
  category text NOT NULL CHECK (category IN ('editorial','refinement')),
  side text NOT NULL CHECK (side IN ('left','right','both')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  url text NOT NULL DEFAULT '' CHECK (char_length(url)<=2048),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (category='editorial' OR side='right')
);

CREATE TABLE IF NOT EXISTS app_private.promo_card_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  before_value jsonb,
  after_value jsonb,
  actor_id uuid NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_private.promo_cards
(seed_key,category,side,title,body,url,enabled,sort_order)
SELECT seed_key,category,side,title,body,url,enabled,sort_order
FROM jsonb_to_recordset('[{"seed_key":"editorial-1","category":"editorial","side":"both","sort_order":0,"enabled":true,"title":"You''re More Than a Selfie","body":"Ten profile essays. Plenty of room to explain why you''re worth getting to know.","url":"/profiles/{slug}"},{"seed_key":"editorial-2","category":"editorial","side":"both","sort_order":1,"enabled":true,"title":"Answer Some Questions","body":"The more you put in, the more you get out.","url":"/questions"},{"seed_key":"editorial-3","category":"editorial","side":"both","sort_order":2,"enabled":true,"title":"Dealbreakers Welcome","body":"Some things matter more than others.","url":"/questions"},{"seed_key":"editorial-4","category":"editorial","side":"both","sort_order":3,"enabled":true,"title":"Explain Yourself","body":"Your answer is interesting. Your reasoning might be even more interesting. Add an explanation to any match question.","url":"/questions"},{"seed_key":"editorial-5","category":"editorial","side":"both","sort_order":4,"enabled":true,"title":"It''s Complicated","body":"Match, Friend, and Enemy percentages. Because compatibility isn''t always a simple yes or no.","url":""},{"seed_key":"editorial-6","category":"editorial","side":"both","sort_order":5,"enabled":true,"title":"Changed Your Mind?","body":"Your answers aren''t carved in stone. Revisit your match questions whenever you feel differently.","url":"/questions"},{"seed_key":"editorial-7","category":"editorial","side":"both","sort_order":6,"enabled":true,"title":"What''s Your Dating Persona?","body":"Loverboy? Nymph? Something considerably less flattering? Take the Dating Persona Test and find out.","url":"/persona"},{"seed_key":"editorial-8","category":"editorial","side":"both","sort_order":7,"enabled":true,"title":"Collect Personality Awards","body":"Your answers reveal more than compatibility. Find out what they say about your personality.","url":"/profiles/{slug}?tab=personality"},{"seed_key":"editorial-9","category":"editorial","side":"both","sort_order":8,"enabled":true,"title":"Read Before You Swipe","body":"Just kidding. There''s no swiping here. You''ll have to learn something about a person instead.","url":""},{"seed_key":"editorial-10","category":"editorial","side":"both","sort_order":9,"enabled":true,"title":"Filters. Remember Those?","body":"Search for what you''re actually looking for. Revolutionary technology from approximately 2005.","url":"/matches"},{"seed_key":"editorial-11","category":"editorial","side":"both","sort_order":10,"enabled":true,"title":"Are They Even Here?","body":"See when somebody was last online. No more wondering whether you''re messaging a ghost.","url":""},{"seed_key":"editorial-12","category":"editorial","side":"both","sort_order":11,"enabled":true,"title":"Who''s Been Looking?","body":"Somebody checked out your profile. Curious? See who''s been stopping by.","url":""},{"seed_key":"editorial-13","category":"editorial","side":"both","sort_order":12,"enabled":true,"title":"Start a Conversation","body":"You''ve read their profile. You''ve compared your answers. Now try saying something interesting.","url":""},{"seed_key":"editorial-14","category":"editorial","side":"both","sort_order":13,"enabled":true,"title":"A Little Serendipity","body":"Meet someone you might not have searched for yourself. Sometimes that''s how the good stories start.","url":""},{"seed_key":"editorial-15","category":"editorial","side":"both","sort_order":14,"enabled":true,"title":"Everybody, Get In Here","body":"Dating doesn''t have to be a series of private conversations. Come hang out on the community board.","url":""},{"seed_key":"editorial-16","category":"editorial","side":"both","sort_order":15,"enabled":true,"title":"Find Your People","body":"Obscure hobbies? Unusual interests? There''s probably somebody else here who''s into that.","url":""},{"seed_key":"editorial-17","category":"editorial","side":"both","sort_order":16,"enabled":true,"title":"Think You''re Clever?","body":"Create your own quiz and see how everyone else measures up to your questionable standards.","url":""},{"seed_key":"editorial-18","category":"editorial","side":"both","sort_order":17,"enabled":true,"title":"Numbers Don''t Lie. Usually.","body":"Visit OgTrends for observations, statistics, and uncomfortable truths about online dating.","url":"/ogtrends"},{"seed_key":"editorial-19","category":"editorial","side":"both","sort_order":18,"enabled":true,"title":"Earn Your OG Status","body":"Build a great profile. Be good to the community. Earn your way out of membership fees permanently.","url":""},{"seed_key":"editorial-20","category":"editorial","side":"both","sort_order":19,"enabled":true,"title":"The Original OGs","body":"The first 250 members to complete a profile get lifetime OG Status and a Founder Profile badge.","url":""},{"seed_key":"refinement-1","category":"refinement","side":"right","sort_order":0,"enabled":true,"title":"Give Them Something to Read","body":"Your photos might catch their eye. Your words are what give them a reason to stay.","url":"/profiles/{slug}?tab=about"},{"seed_key":"refinement-2","category":"refinement","side":"right","sort_order":1,"enabled":true,"title":"Picture Perfect?","body":"That photo from six years ago might deserve retirement. Show people who you are today.","url":"/profiles/{slug}?tab=photos"},{"seed_key":"refinement-3","category":"refinement","side":"right","sort_order":2,"enabled":true,"title":"The Devil''s in the Details","body":"A few little details can make a big difference. Make sure yours are up to date.","url":"/settings"},{"seed_key":"refinement-4","category":"refinement","side":"right","sort_order":3,"enabled":true,"title":"Still Stand by That?","body":"People change their minds. Revisit your match questions and make sure your answers still reflect yours.","url":"/profiles/{slug}?tab=questions"},{"seed_key":"refinement-5","category":"refinement","side":"right","sort_order":4,"enabled":true,"title":"Know Thyself","body":"What do your answers say about you? Explore your personality traits and see how you''re shaping up.","url":"/profiles/{slug}?tab=personality"}]'::jsonb)
  AS s(seed_key text,category text,side text,title text,body text,url text,
       enabled boolean,sort_order integer)
WHERE NOT EXISTS (SELECT 1 FROM app_private.promo_card_events)
ON CONFLICT (seed_key) DO NOTHING;

REVOKE ALL ON app_private.promo_cards FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
REVOKE ALL ON app_private.promo_card_events FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
REVOKE ALL ON SEQUENCE app_private.promo_cards_id_seq FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
REVOKE ALL ON SEQUENCE app_private.promo_card_events_id_seq FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;

-- Only enabled, display-safe fields are available to anonymous visitors.
CREATE OR REPLACE FUNCTION app_private.promo_cards_public()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',c.id,'category',c.category,'side',c.side,
   'title',c.title,'body',c.body,'url',c.url,'sortOrder',c.sort_order)
   ORDER BY c.sort_order,c.id),'[]'::jsonb)
 FROM app_private.promo_cards c WHERE c.enabled=true;
$$;

CREATE OR REPLACE FUNCTION app_private.promo_cards_admin()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
 IF NOT app_private.admin_is_authorized() THEN
   RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'category',c.category,'side',c.side,'title',c.title,
   'body',c.body,'url',c.url,'enabled',c.enabled,
   'sortOrder',c.sort_order,'updatedAt',c.updated_at)
   ORDER BY c.category,c.sort_order,c.id)
   FROM app_private.promo_cards c),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.promo_cards_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE new_row app_private.promo_cards%ROWTYPE; actor uuid;
BEGIN
 IF NOT app_private.admin_is_authorized() THEN
   RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
 END IF;
 actor:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 INSERT INTO app_private.promo_cards(category,side,title,body,url,enabled,sort_order,updated_by)
 VALUES (p_payload->>'category',p_payload->>'side',p_payload->>'title',
   p_payload->>'body',COALESCE(p_payload->>'url',''),
   (p_payload->>'enabled')::boolean,
   COALESCE((SELECT max(sort_order)+1 FROM app_private.promo_cards),0),actor)
 RETURNING * INTO new_row;
 INSERT INTO app_private.promo_card_events(card_id,action,after_value,actor_id)
 VALUES(new_row.id,'create',to_jsonb(new_row),actor);
 RETURN app_private.promo_cards_admin();
END;
$$;

CREATE OR REPLACE FUNCTION app_private.promo_cards_update(p_id bigint,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE before_row app_private.promo_cards%ROWTYPE;
        after_row app_private.promo_cards%ROWTYPE; actor uuid;
BEGIN
 IF NOT app_private.admin_is_authorized() THEN
   RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
 END IF;
 actor:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 SELECT * INTO before_row FROM app_private.promo_cards WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Promo card not found' USING ERRCODE='22023'; END IF;
 UPDATE app_private.promo_cards SET category=p_payload->>'category',
   side=p_payload->>'side',title=p_payload->>'title',body=p_payload->>'body',
   url=COALESCE(p_payload->>'url',''),enabled=(p_payload->>'enabled')::boolean,
   updated_by=actor,updated_at=now() WHERE id=p_id RETURNING * INTO after_row;
 INSERT INTO app_private.promo_card_events(card_id,action,before_value,after_value,actor_id)
 VALUES(p_id,'update',to_jsonb(before_row),to_jsonb(after_row),actor);
 RETURN app_private.promo_cards_admin();
END;
$$;

CREATE OR REPLACE FUNCTION app_private.promo_cards_delete(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE before_row app_private.promo_cards%ROWTYPE; actor uuid;
BEGIN
 IF NOT app_private.admin_is_authorized() THEN
   RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
 END IF;
 actor:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 DELETE FROM app_private.promo_cards WHERE id=p_id RETURNING * INTO before_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Promo card not found' USING ERRCODE='22023'; END IF;
 INSERT INTO app_private.promo_card_events(card_id,action,before_value,actor_id)
 VALUES(p_id,'delete',to_jsonb(before_row),actor);
 RETURN app_private.promo_cards_admin();
END;
$$;

REVOKE ALL ON FUNCTION app_private.promo_cards_public() FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.promo_cards_admin() FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.promo_cards_create(jsonb) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.promo_cards_update(bigint,jsonb) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.promo_cards_delete(bigint) FROM PUBLIC,ogcupid_delete_api;

GRANT EXECUTE ON FUNCTION app_private.promo_cards_public() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.promo_cards_admin() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.promo_cards_create(jsonb) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.promo_cards_update(bigint,jsonb) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.promo_cards_delete(bigint) TO ogcupid_member_api;
