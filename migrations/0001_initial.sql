CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  last_read INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS letters (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 8),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  publication_url TEXT,
  release_after_days INTEGER NOT NULL CHECK (release_after_days >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id TEXT NOT NULL,
  letter_number INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  UNIQUE(subscriber_id, letter_number),
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY(letter_number) REFERENCES letters(number)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_token_hash ON subscribers(token_hash);

INSERT OR IGNORE INTO letters (number, slug, title, publication_url, release_after_days, updated_at) VALUES
  (1, 'pismo-1', 'Письмо 1', 'https://www.dropbox.com/scl/fi/bbrz087dog8jriihh5pfs/publication.json?rlkey=yevc5rxq3dsvn1ffr9iqwp61v&raw=1', 0, datetime('now')),
  (2, 'pismo-2', 'Письмо 2', NULL, 2, datetime('now')),
  (3, 'pismo-3', 'Письмо 3', NULL, 4, datetime('now')),
  (4, 'pismo-4', 'Письмо 4', NULL, 6, datetime('now')),
  (5, 'pismo-5', 'Письмо 5', NULL, 8, datetime('now')),
  (6, 'pismo-6', 'Письмо 6', NULL, 10, datetime('now')),
  (7, 'pismo-7', 'Письмо 7', NULL, 12, datetime('now')),
  (8, 'pismo-8', 'Письмо 8', NULL, 14, datetime('now'));
