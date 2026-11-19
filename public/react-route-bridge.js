/* Canonical public routes enter the React application.  `ogcl_embed=1` is
 * reserved for the static source reader while those documents are being
 * transcribed into React components; it is never a normal-user fallback. */
(function () {
  if (new URLSearchParams(location.search).get("ogcl_embed") === "1") return;
  var routes = {
    "/ogtrends/": "/ogtrends", "/ogtrends/zero/": "/ogtrends/zero",
    "/ogtrends/perfect-profile/": "/ogtrends/perfect-profile",
    "/ogtrends/references/": "/ogtrends/references", "/contact/": "/contact",
    "/privacy/": "/privacy", "/terms/": "/terms", "/account/persona.html": "/persona"
  };
  var target = routes[location.pathname];
  if (target) location.replace("/#" + target + location.hash);
}());
