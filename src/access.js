export const READER_TOKEN_KEY = "vvbt-reader-access-token";

export function resolveShareToken(query) {
  return query.get("share") || "";
}

export function resolveAccessToken(query, storage = globalThis.localStorage) {
  const supplied = query.get("t") || "";
  if (supplied) {
    try { storage?.setItem(READER_TOKEN_KEY, supplied); } catch {}
    return supplied;
  }
  try { return storage?.getItem(READER_TOKEN_KEY) || ""; } catch { return ""; }
}

export function selectAccessibleLetter(session, requested = "") {
  const letters = session?.letters || [];
  if (!letters.length) throw new Error("Пока нет доступных писем.");
  if (requested) {
    const found = letters.find(letter => letter.slug === requested || String(letter.number) === requested);
    if (!found) throw new Error("Это письмо пока недоступно.");
    return found;
  }
  return letters.find(letter => letter.number === session.lastRead) || letters.at(-1);
}

export function createAccessClient(token, baseUrl = location.origin, { shared = false } = {}) {
  const request = async path => {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { authorization: `${shared ? "Shared" : "Bearer"} ${token}` },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Сервис чтения недоступен (${response.status}).`);
    return data;
  };
  return {
    session: () => request("/api/session"),
    letter: slug => request(`/api/letters/${encodeURIComponent(slug)}`)
  };
}
