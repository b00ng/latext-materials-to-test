CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('latex', 'pdf', 'docx', 'image')),
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'normalizing', 'processing', 'completed', 'failed')),
  r2_key TEXT NOT NULL,
  manifest_key TEXT,
  metadata TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_source_type ON materials(source_type);
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
