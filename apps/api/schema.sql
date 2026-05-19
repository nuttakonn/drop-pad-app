CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT
);

CREATE TABLE IF NOT EXISTS workspace_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  file_key TEXT,
  created_at TEXT NOT NULL
);
