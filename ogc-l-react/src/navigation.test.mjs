import test from "node:test";
import assert from "node:assert/strict";
import { primaryNavigation, defaultRoute, validRoutePaths } from "./navigation.mjs";

test("classic shell keeps exactly five primary destinations", () => {
  assert.deepEqual(primaryNavigation.map(item => item.label),
    ["MATCHES", "MESSAGES", "VISITORS", "QUICKMATCH", "COMMUNITY"]);
});
test("primary destinations have unique route paths", () => {
  assert.equal(new Set(primaryNavigation.map(item => item.path)).size, 5);
  assert.ok(primaryNavigation.every(item => item.path.startsWith("/")));
  assert.equal(defaultRoute, "/matches");
});
test("question flow remains a secondary route rather than a primary tab", () => {
  assert.ok(validRoutePaths.includes("/questions"));
  assert.equal(primaryNavigation.some(item => item.path === "/questions"), false);
});
