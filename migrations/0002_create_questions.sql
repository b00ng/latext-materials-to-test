CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  stem TEXT NOT NULL,
  stem_latex TEXT NOT NULL,
  choices TEXT NOT NULL,
  correct_answer TEXT CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  answer_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (answer_status IN ('confirmed', 'needs_review')),
  explanation TEXT,
  explanation_latex TEXT,
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
  topic TEXT,
  tags TEXT,
  source_chapter INTEGER,
  source_section TEXT,
  source_question_index INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_answer_status ON questions(answer_status);
