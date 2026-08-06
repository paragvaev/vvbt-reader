import test from "node:test";
import assert from "node:assert/strict";
import { nextTheme, resolveTheme } from "../src/theme.js";

test("reader theme follows the system until an explicit preference exists", () => {
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("reader theme toggle alternates light and dark", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
});
