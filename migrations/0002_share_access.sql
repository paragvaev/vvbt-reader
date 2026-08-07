CREATE TABLE IF NOT EXISTS share_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
