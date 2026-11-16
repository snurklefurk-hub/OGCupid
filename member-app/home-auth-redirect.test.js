import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../public/home-auth-redirect.js", import.meta.url),
  "utf8"
);

function runRedirectCheck({ payload = null, status = 200, failure = false, hang = false } = {}) {
  let pending = false, timer = null, cleared = false, request = null;
  const redirects = [];
  const context = {
    document: {
      documentElement: {
        classList: {
          add(name) { if (name === "ogc-session-pending") pending = true; },
          remove(name) { if (name === "ogc-session-pending") pending = false; }
        }
      }
    },
    window: {
      location: { replace(path) { redirects.push(path); } }
    },
    AbortController,
    setTimeout(callback, delay) {
      timer = { callback, delay };
      return 1;
    },
    clearTimeout() { cleared = true; },
    fetch: async (url, options) => {
      request = { url, options };
      if (failure) throw Error("Network failure");
      if (hang) {
        return new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => reject(Error("Aborted")));
        });
      }
      return { ok: status >= 200 && status < 300, json: async () => payload };
    }
  };
  runInNewContext(source, context, { filename: "home-auth-redirect.js" });
  return {
    get pending() { return pending; },
    get request() { return request; },
    get redirects() { return redirects; },
    get cleared() { return cleared; },
    get timer() { return timer; },
    tick() { timer?.callback(); },
    async flush() { await new Promise(resolve => setImmediate(resolve)); }
  };
}

test("verified session redirects to member area, including both Neon response shapes", async () => {
  for (const payload of [
    { user: { id: "member-1" }, session: { id: "session-1" } },
    { data: { user: { id: "member-1" }, session: { id: "session-1" } } }
  ]) {
    const check = runRedirectCheck({ payload });
    assert.equal(check.pending, true, "homepage stays hidden while checking");
    await check.flush();
    assert.deepEqual(check.redirects, ["/account/"]);
    assert.ok(check.request.url.endsWith("/get-session"));
    assert.equal(check.request.options.method, "GET");
    assert.equal(check.request.options.credentials, "include");
    assert.equal(check.request.options.cache, "no-store");
    assert.equal(check.cleared, true);
  }
});

test("no session, invalid session, and non-success response display homepage", async () => {
  for (const scenario of [
    { payload: null },
    { payload: { user: { id: "old-user" }, session: null } },
    { payload: { user: null, session: { id: "old-session" } } },
    { payload: {}, status: 401 },
    { payload: {}, status: 500 }
  ]) {
    const check = runRedirectCheck(scenario);
    await check.flush();
    assert.deepEqual(check.redirects, []);
    assert.equal(check.pending, false);
    assert.equal(check.cleared, true);
  }
});

test("network failures and five-second timeout leave public homepage accessible", async () => {
  const blocked = runRedirectCheck({ failure: true });
  await blocked.flush();
  assert.equal(blocked.pending, false);
  assert.deepEqual(blocked.redirects, []);

  const timeout = runRedirectCheck({ hang: true });
  assert.equal(timeout.timer.delay, 5000);
  timeout.tick();
  await timeout.flush();
  assert.equal(timeout.pending, false);
  assert.deepEqual(timeout.redirects, []);
});

test("no spoofable local user flag is used and the homepage hides during verification", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  assert.match(source, /session\s*&&\s*user\?\.id/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /html\.ogc-session-pending body\{visibility:hidden\}/);
  assert.match(html, /src="\/home-auth-redirect\.js\?v=1"/);
});
