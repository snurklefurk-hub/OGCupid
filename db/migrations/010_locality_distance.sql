-- 010: Strict pure geographic-distance helper for future member matching.
-- Compute straight-line great-circle distance in miles between locality centroids.
-- No member locations are queried or exposed by this function.
CREATE OR REPLACE FUNCTION app_private.locality_distance_miles(
  first_lat double precision, first_lon double precision,
  second_lat double precision, second_lon double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $geo$
  SELECT 2.0 * 3958.7613 * asin(
    sqrt(least(1.0, greatest(0.0,
      power(sin(radians((second_lat-first_lat)/2.0)),2) +
      cos(radians(first_lat)) * cos(radians(second_lat)) *
      power(sin(radians((second_lon-first_lon)/2.0)),2)
    )))
  );
$geo$;
REVOKE ALL ON FUNCTION app_private.locality_distance_miles(
  double precision,double precision,double precision,double precision
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.locality_distance_miles(
  double precision,double precision,double precision,double precision
) TO ogcupid_member_api;
COMMENT ON FUNCTION app_private.locality_distance_miles(
  double precision,double precision,double precision,double precision
) IS 'Straight-line miles between two coarse locality centroids. Never a driving distance.';
