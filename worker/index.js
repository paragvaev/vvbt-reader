import { effectiveStartAt, nextUnlock, unlockedLetters } from "./access-rules.js";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});

const publicError = (message, status = 400) => json({ error: message }, status);
const SENDPULSE_WEBHOOK_VERIFICATION_CODE = "eb092918a4964088b3fa8029e68335b7";
export const sendpulseWebhookResult = (status, message, code = status ? 1 : 11110111, httpStatus = 200) =>
  json([{ status, message, code }], httpStatus);
export const sendpulseWebhookVerified = () => json({ code: SENDPULSE_WEBHOOK_VERIFICATION_CODE });
const utf8 = value => new TextEncoder().encode(value);
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join("");
const sha256 = async value => hex(await crypto.subtle.digest("SHA-256", utf8(value)));
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export function validatePublicationRegistration(input) {
  const number = Number(input?.number);
  const slug = String(input?.slug || "").trim().toLowerCase();
  const title = String(input?.title || "").trim();
  const publicationUrl = String(input?.publicationUrl || "").trim();
  const releaseAfterDays = Number(input?.releaseAfterDays);
  if (!Number.isInteger(number) || number < 1 || number > 8) throw new Error("Номер письма должен быть от 1 до 8.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug письма содержит недопустимые символы.");
  if (!title || title.length > 255) throw new Error("Укажите название письма длиной до 255 символов.");
  if (!Number.isInteger(releaseAfterDays) || releaseAfterDays < 0 || releaseAfterDays > 365) throw new Error("Некорректная задержка публикации.");
  let parsedUrl;
  try { parsedUrl = new URL(publicationUrl); } catch { throw new Error("Некорректная ссылка publication.json."); }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || publicationUrl.length > 2048) {
    throw new Error("Для publication.json требуется безопасная HTTPS-ссылка.");
  }
  return { number, slug, title, publicationUrl: parsedUrl.toString(), releaseAfterDays };
}

function requestToken(request, url) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("t") || "";
}

function requestShareToken(request, url) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Shared ") ? auth.slice(7) : url.searchParams.get("share") || "";
}

async function sharedAccessForToken(env, token) {
  if (!token || token.length < 32) return null;
  const series = await env.DB.prepare("SELECT 1 FROM share_access WHERE id = 1 AND token = ?")
    .bind(token).first();
  if (series) return { scope: "series", letterSlug: null };
  const letter = await env.DB.prepare("SELECT letter_slug FROM letter_share_access WHERE token = ?")
    .bind(token).first();
  return letter?.letter_slug ? { scope: "letter", letterSlug: letter.letter_slug } : null;
}

async function ensureShareToken(env, now) {
  const existing = await env.DB.prepare("SELECT token FROM share_access WHERE id = 1").first();
  if (existing?.token) return existing.token;
  const token = randomToken();
  await env.DB.prepare("INSERT OR IGNORE INTO share_access (id, token, created_at, updated_at) VALUES (1, ?, ?, ?)")
    .bind(token, now, now).run();
  const stored = await env.DB.prepare("SELECT token FROM share_access WHERE id = 1").first();
  if (!stored?.token) throw new Error("Share token was not stored");
  return stored.token;
}

async function ensureLetterShareToken(env, slug, now) {
  const existing = await env.DB.prepare("SELECT token FROM letter_share_access WHERE letter_slug = ?")
    .bind(slug).first();
  if (existing?.token) return existing.token;
  const token = randomToken();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO letter_share_access (letter_slug, token, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).bind(slug, token, now, now).run();
  const stored = await env.DB.prepare("SELECT token FROM letter_share_access WHERE letter_slug = ?")
    .bind(slug).first();
  if (!stored?.token) throw new Error("Letter share token was not stored");
  return stored.token;
}

export const publishedLetters = letters => letters.filter(letter => !!letter.publication_url);
export const sharedLetters = (letters, access) => {
  const published = publishedLetters(letters);
  return access?.scope === "letter" ? published.filter(letter => letter.slug === access.letterSlug) : published;
};

async function subscriberForToken(env, token) {
  if (!token || token.length < 32) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare("SELECT * FROM subscribers WHERE token_hash = ? AND status = 'active'")
    .bind(tokenHash).first();
}

async function allLetters(env) {
  const result = await env.DB.prepare("SELECT * FROM letters ORDER BY number").all();
  return result.results || [];
}

async function sendpulseAccessToken(env) {
  if (!env.SENDPULSE_CLIENT_ID || !env.SENDPULSE_CLIENT_SECRET) return null;
  const response = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.SENDPULSE_CLIENT_ID,
      client_secret: env.SENDPULSE_CLIENT_SECRET
    })
  });
  if (!response.ok) throw new Error(`SendPulse OAuth failed (${response.status})`);
  return (await response.json()).access_token;
}

export function configuredAddressBookIds(env) {
  return [...new Set([
    env.SENDPULSE_ADDRESS_BOOK_ID,
    ...String(env.SENDPULSE_ADDRESS_BOOK_IDS || "").split(",")
  ].map(value => String(value || "").trim()).filter(value => /^\d+$/.test(value)))];
}

async function writeReaderTokenToSendpulse(env, email, token, selectedAddressBookIds = null) {
  const addressBookIds = selectedAddressBookIds || configuredAddressBookIds(env);
  if (!addressBookIds.length) return 0;
  const accessToken = await sendpulseAccessToken(env);
  if (!accessToken) return 0;
  let synchronized = 0;
  for (const addressBookId of addressBookIds) {
    const response = await fetch(`https://api.sendpulse.com/addressbooks/${addressBookId}/emails/variable`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email, variables: [{ name: "reader_token", value: token }] })
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.result !== false) synchronized += 1;
  }
  if (!synchronized) throw new Error("SendPulse variable update failed for configured address books");
  return synchronized;
}

async function synchronizeSubscriber(email, env) {
  const now = new Date().toISOString();
  const emailHash = await sha256(email);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const existing = await env.DB.prepare("SELECT id, started_at FROM subscribers WHERE email_hash = ?").bind(emailHash).first();
  const id = existing?.id || crypto.randomUUID();
  const startedAt = existing?.started_at || effectiveStartAt(now, env.CAMPAIGN_LAUNCH_AT);
  await env.DB.prepare(`
    INSERT INTO subscribers (id, email_hash, token_hash, started_at, last_read, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 'active', ?, ?)
    ON CONFLICT(email_hash) DO UPDATE SET token_hash = excluded.token_hash, status = 'active', updated_at = excluded.updated_at
  `).bind(id, emailHash, tokenHash, startedAt, now, now).run();

  const synchronizedAddressBooks = await writeReaderTokenToSendpulse(env, email, token);
  if (synchronizedAddressBooks < 1) throw new Error("reader_token synchronization failed");
}

async function registerSubscriber(request, env, url, executionContext) {
  const suppliedKey = url.searchParams.get("key") || request.headers.get("x-vvbt-webhook-key") || "";
  if (!env.SENDPULSE_WEBHOOK_KEY || suppliedKey !== env.SENDPULSE_WEBHOOK_KEY) return publicError("Доступ запрещён.", 403);
  let email = url.searchParams.get("email") || "";
  if (request.method === "POST" && request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    const event = Array.isArray(body) ? body[0] || {} : body;
    email = event.email || email;
  }
  email = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return sendpulseWebhookResult(false, "Не указан корректный email.", 11110111, 400);

  const work = synchronizeSubscriber(email, env);
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(work.catch(error => {
      console.error("SendPulse token synchronization failed", error instanceof Error ? error.message : "unknown error");
    }));
    return sendpulseWebhookVerified();
  }
  try {
    await work;
    return sendpulseWebhookVerified();
  } catch (error) {
    console.error("SendPulse token synchronization failed", error instanceof Error ? error.message : "unknown error");
    return sendpulseWebhookResult(false, "reader_token synchronization failed");
  }
}

function publicationAdminAuthorized(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-vvbt-publication-key") || "";
  return !!env.PUBLICATION_ADMIN_KEY && suppliedKey === env.PUBLICATION_ADMIN_KEY;
}

async function publicationAdmin(request, env) {
  if (!publicationAdminAuthorized(request, env)) return publicError("Доступ запрещён.", 403);
  if (request.method === "GET") {
    return json({ ok: true, letters: await allLetters(env) });
  }
  let publication;
  try {
    publication = validatePublicationRegistration(await request.json());
  } catch (error) {
    return publicError(error instanceof Error ? error.message : "Некорректные данные публикации.");
  }
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO letters (number, slug, title, publication_url, release_after_days, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(number) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        publication_url = excluded.publication_url,
        release_after_days = excluded.release_after_days,
        updated_at = excluded.updated_at
    `).bind(publication.number, publication.slug, publication.title, publication.publicationUrl, publication.releaseAfterDays, now).run();
  } catch {
    return publicError("Не удалось зарегистрировать письмо. Проверьте уникальность номера и slug.", 409);
  }
  let seriesShareToken;
  let letterShareToken;
  try {
    [seriesShareToken, letterShareToken] = await Promise.all([
      ensureShareToken(env, now),
      ensureLetterShareToken(env, publication.slug, now)
    ]);
  } catch {
    return publicError("Письмо зарегистрировано, но не удалось подготовить ссылки для чтения.", 500);
  }
  const readerOrigin = String(env.READER_ORIGIN || "https://wwy.vlsv.gay").replace(/\/$/, "");
  const seriesShareUrl = `${readerOrigin}/?share=${encodeURIComponent(seriesShareToken)}&letter=${encodeURIComponent(publication.slug)}`;
  const letterShareUrl = `${readerOrigin}/?share=${encodeURIComponent(letterShareToken)}&letter=${encodeURIComponent(publication.slug)}`;
  return json({
    ok: true,
    letter: { ...publication, updatedAt: now },
    shareUrl: seriesShareUrl,
    seriesShareUrl,
    letterShareUrl
  });
}

async function sendpulseAdminStatus(request, env) {
  if (!publicationAdminAuthorized(request, env)) return publicError("Доступ запрещён.", 403);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return publicError("Не указан корректный email.");
  let accessToken;
  try {
    accessToken = await sendpulseAccessToken(env);
  } catch {
    return json({ ok: false, oauth: false, books: [] });
  }
  if (!accessToken) return json({ ok: false, oauth: false, books: [] });
  const books = [];
  for (const addressBookId of configuredAddressBookIds(env)) {
    const headers = { authorization: `Bearer ${accessToken}` };
    const [variablesResponse, contactResponse] = await Promise.all([
      fetch(`https://api.sendpulse.com/addressbooks/${addressBookId}/variables`, { headers }),
      fetch(`https://api.sendpulse.com/addressbooks/${addressBookId}/emails/${encodeURIComponent(email)}`, { headers })
    ]);
    const variables = variablesResponse.ok ? await variablesResponse.json().catch(() => []) : [];
    const contact = contactResponse.ok ? await contactResponse.json().catch(() => ({})) : {};
    const tokenVariable = Array.isArray(contact.variables)
      ? contact.variables.find(variable => variable.name === "reader_token")
      : null;
    books.push({
      addressBookId,
      variablesStatus: variablesResponse.status,
      contactStatus: contactResponse.status,
      variableExists: Array.isArray(variables) && variables.some(variable => variable.name === "reader_token"),
      tokenPresent: Boolean(tokenVariable?.value)
    });
  }
  return json({ ok: true, oauth: true, books });
}

async function sendpulseAdminResync(request, env) {
  if (!publicationAdminAuthorized(request, env)) return publicError("Доступ запрещён.", 403);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const addressBookId = String(body.addressBookId || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return publicError("Не указан корректный email.");
  if (!configuredAddressBookIds(env).includes(addressBookId)) return publicError("Адресная книга не разрешена.", 403);
  const token = randomToken();
  try {
    const addressBookIds = configuredAddressBookIds(env);
    const synchronized = await writeReaderTokenToSendpulse(env, email, token, addressBookIds);
    if (synchronized !== addressBookIds.length) return publicError("SendPulse не синхронизировал reader_token со всеми книгами контакта.", 502);
  } catch {
    return publicError("SendPulse не принял значение reader_token.", 502);
  }
  const now = new Date().toISOString();
  const emailHash = await sha256(email);
  const tokenHash = await sha256(token);
  const existing = await env.DB.prepare("SELECT id FROM subscribers WHERE email_hash = ?").bind(emailHash).first();
  if (!existing) return publicError("Тестовый подписчик не найден в Cloudflare.", 404);
  await env.DB.prepare("UPDATE subscribers SET token_hash = ?, status = 'active', updated_at = ? WHERE id = ?")
    .bind(tokenHash, now, existing.id).run();
  return json({ ok: true, addressBookId, tokenStored: true });
}

async function sessionResponse(request, env, url) {
  const sharedAccess = await sharedAccessForToken(env, requestShareToken(request, url));
  if (sharedAccess) {
    const letters = sharedLetters(await allLetters(env), sharedAccess);
    return json({
      shared: true,
      shareScope: sharedAccess.scope,
      startedAt: null,
      lastRead: 0,
      nextUnlockAt: null,
      letters: letters.map(letter => ({ number: letter.number, slug: letter.slug, title: letter.title }))
    });
  }
  const subscriber = await subscriberForToken(env, requestToken(request, url));
  if (!subscriber) return publicError("Персональная ссылка недействительна.", 401);
  const letters = await allLetters(env);
  const available = unlockedLetters(letters, subscriber.started_at);
  return json({
    startedAt: subscriber.started_at,
    lastRead: subscriber.last_read,
    nextUnlockAt: nextUnlock(letters, subscriber.started_at),
    letters: available.map(letter => ({ number: letter.number, slug: letter.slug, title: letter.title }))
  });
}

async function letterResponse(request, env, url, slug) {
  const sharedAccess = await sharedAccessForToken(env, requestShareToken(request, url));
  if (sharedAccess) {
    const letter = sharedLetters(await allLetters(env), sharedAccess).find(item => item.slug === slug);
    if (!letter) return publicError("Письмо не опубликовано.", 404);
    const upstream = await fetch(letter.publication_url, { headers: { accept: "application/json" } });
    if (!upstream.ok) return publicError("Не удалось загрузить опубликованное письмо.", 502);
    return json(await upstream.json());
  }
  const token = requestToken(request, url);
  const subscriber = await subscriberForToken(env, token);
  if (!subscriber) return publicError("Персональная ссылка недействительна.", 401);
  const letters = await allLetters(env);
  const letter = unlockedLetters(letters, subscriber.started_at).find(item => item.slug === slug);
  if (!letter) return publicError("Письмо ещё недоступно.", 403);
  const upstream = await fetch(letter.publication_url, { headers: { accept: "application/json" } });
  if (!upstream.ok) return publicError("Не удалось загрузить опубликованное письмо.", 502);
  const data = await upstream.json();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE subscribers SET last_read = MAX(last_read, ?), updated_at = ? WHERE id = ?").bind(letter.number, now, subscriber.id),
    env.DB.prepare("INSERT OR IGNORE INTO reading_events (subscriber_id, letter_number, opened_at) VALUES (?, ?, ?)").bind(subscriber.id, letter.number, now)
  ]);
  return json(data);
}

export async function handleApiRequest(request, env, executionContext) {
  const url = new URL(request.url);
  if (url.pathname === "/api/session" && request.method === "GET") return sessionResponse(request, env, url);
  if (["/api/sendpulse/subscribe", "/api/sendpulse/subscribe-v2"].includes(url.pathname) && ["GET", "POST"].includes(request.method)) return registerSubscriber(request, env, url, executionContext);
  if (url.pathname === "/api/admin/publications" && ["GET", "POST"].includes(request.method)) return publicationAdmin(request, env);
  if (url.pathname === "/api/admin/sendpulse/status" && request.method === "POST") return sendpulseAdminStatus(request, env);
  if (url.pathname === "/api/admin/sendpulse/resync" && request.method === "POST") return sendpulseAdminResync(request, env);
  const match = url.pathname.match(/^\/api\/letters\/([a-z0-9-]+)$/);
  if (match && request.method === "GET") return letterResponse(request, env, url, match[1]);
  return publicError("Метод API не найден.", 404);
}

export default {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApiRequest(request, env, executionContext);
    return env.ASSETS.fetch(request);
  }
};
