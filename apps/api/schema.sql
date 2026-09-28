DROP TABLE IF EXISTS workspace_items;
DROP TABLE IF EXISTS workspaces;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT DEFAULT '',
  content_version INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);

CREATE TABLE IF NOT EXISTS workspace_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  file_key TEXT,
  created_at TEXT NOT NULL
);
