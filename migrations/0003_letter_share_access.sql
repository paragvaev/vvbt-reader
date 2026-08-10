CREATE TABLE IF NOT EXISTS letter_share_access (
  letter_slug TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
