const DAY_MS = 86_400_000;

export function effectiveStartAt(registeredAt, launchAt) {
  const registered = new Date(registeredAt).getTime();
  const launch = new Date(launchAt).getTime();
  if (!Number.isFinite(registered)) throw new Error("Invalid registration date");
  return new Date(Number.isFinite(launch) ? Math.max(registered, launch) : registered).toISOString();
}

export function isLetterUnlocked(startedAt, releaseAfterDays, now = new Date()) {
  const start = new Date(startedAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current)) return false;
  return current >= start + Number(releaseAfterDays || 0) * DAY_MS;
}

export function unlockedLetters(letters, startedAt, now = new Date()) {
  return letters
    .filter(letter => letter.publication_url && isLetterUnlocked(startedAt, letter.release_after_days, now))
    .sort((a, b) => a.number - b.number);
}

export function nextUnlock(letters, startedAt, now = new Date()) {
  const start = new Date(startedAt).getTime();
  const current = new Date(now).getTime();
  const upcoming = letters
    .filter(letter => letter.publication_url)
    .map(letter => ({ ...letter, unlockAt: start + Number(letter.release_after_days || 0) * DAY_MS }))
    .filter(letter => letter.unlockAt > current)
    .sort((a, b) => a.unlockAt - b.unlockAt)[0];
  return upcoming ? new Date(upcoming.unlockAt).toISOString() : null;
}
