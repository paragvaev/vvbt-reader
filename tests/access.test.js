import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccessToken, resolveShareToken, selectAccessibleLetter } from "../src/access.js";
import { effectiveStartAt, isLetterUnlocked, nextUnlock, unlockedLetters } from "../worker/access-rules.js";
import { configuredAddressBookIds, publishedLetters, sendpulseWebhookResult, validatePublicationRegistration } from "../worker/index.js";

const letters = [
  { number: 1, slug: "one", publication_url: "https://example.com/1", release_after_days: 0 },
  { number: 2, slug: "two", publication_url: "https://example.com/2", release_after_days: 2 },
  { number: 3, slug: "three", publication_url: null, release_after_days: 4 }
];

test("clamps pre-launch registrations to the global launch and keeps later registrations", () => {
  const launch = "2026-08-10T15:00:00.000Z";
  assert.equal(effectiveStartAt("2026-08-06T12:00:00Z", launch), launch);
  assert.equal(effectiveStartAt("2026-08-10T16:30:00Z", launch), "2026-08-10T16:30:00.000Z");
});

test("unlocks letters relative to each subscriber start date", () => {
  assert.equal(isLetterUnlocked("2026-08-01T12:00:00Z", 2, "2026-08-03T11:59:59Z"), false);
  assert.equal(isLetterUnlocked("2026-08-01T12:00:00Z", 2, "2026-08-03T12:00:00Z"), true);
  assert.deepEqual(unlockedLetters(letters, "2026-08-01T12:00:00Z", "2026-08-03T12:00:00Z").map(item => item.number), [1, 2]);
});

test("does not expose letters without publication data", () => {
  assert.deepEqual(unlockedLetters(letters, "2026-08-01T12:00:00Z", "2026-08-20T12:00:00Z").map(item => item.number), [1, 2]);
});

test("shared-reader navigation contains every published letter regardless of schedule", () => {
  assert.deepEqual(publishedLetters(letters).map(item => item.number), [1, 2]);
});

test("reports the next configured unlock", () => {
  assert.equal(nextUnlock(letters, "2026-08-01T12:00:00Z", "2026-08-02T12:00:00Z"), "2026-08-03T12:00:00.000Z");
});

test("stores a supplied access token and reuses it", () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) };
  const query = new URLSearchParams("t=personal-token");
  assert.equal(resolveAccessToken(query, storage), "personal-token");
  assert.equal(resolveAccessToken(new URLSearchParams(), storage), "personal-token");
});

test("reads a shared-reader token without mixing it with subscriber storage", () => {
  assert.equal(resolveShareToken(new URLSearchParams("share=private-share-token")), "private-share-token");
  assert.equal(resolveShareToken(new URLSearchParams()), "");
});

test("selects only an accessible requested letter", () => {
  const session = { lastRead: 1, letters: [{ number: 1, slug: "one" }, { number: 2, slug: "two" }] };
  assert.equal(selectAccessibleLetter(session, "two").number, 2);
  assert.throws(() => selectAccessibleLetter(session, "three"), /недоступно/);
});

test("validates a centralized publication registration", () => {
  assert.deepEqual(validatePublicationRegistration({
    number: 2,
    slug: "pismo-2",
    title: "Письмо 2",
    publicationUrl: "https://www.dropbox.com/scl/fi/example/publication.json?raw=1",
    releaseAfterDays: 2
  }), {
    number: 2,
    slug: "pismo-2",
    title: "Письмо 2",
    publicationUrl: "https://www.dropbox.com/scl/fi/example/publication.json?raw=1",
    releaseAfterDays: 2
  });
});

test("rejects unsafe or ambiguous publication registration data", () => {
  assert.throws(() => validatePublicationRegistration({ number: 0, slug: "pismo-1", title: "Письмо", publicationUrl: "https://example.com/a.json", releaseAfterDays: 0 }), /от 1 до 8/);
  assert.throws(() => validatePublicationRegistration({ number: 2, slug: "Письмо 2", title: "Письмо", publicationUrl: "https://example.com/a.json", releaseAfterDays: 2 }), /Slug/);
  assert.throws(() => validatePublicationRegistration({ number: 2, slug: "pismo-2", title: "Письмо", publicationUrl: "http://example.com/a.json", releaseAfterDays: 2 }), /HTTPS/);
});

test("limits SendPulse token synchronization to configured address books", () => {
  assert.deepEqual(configuredAddressBookIds({
    SENDPULSE_ADDRESS_BOOK_ID: "992404",
    SENDPULSE_ADDRESS_BOOK_IDS: "992404, 1145458,invalid"
  }), ["992404", "1145458"]);
});

test("returns the Automation 360 webhook acknowledgement format", async () => {
  const response = sendpulseWebhookResult(true, "reader_token synchronized");
  assert.deepEqual(await response.json(), [{ status: true, message: "reader_token synchronized", code: 1 }]);
});
