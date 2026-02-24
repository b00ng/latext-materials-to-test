CREATE TABLE IF NOT EXISTS test_sheets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'math',
  total_questions INTEGER NOT NULL,
  duration_minutes INTEGER,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
